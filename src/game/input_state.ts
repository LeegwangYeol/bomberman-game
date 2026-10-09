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

const DIR_NONE = Object.freeze({ up: false, down: false, left: false, right: false });
const DIR_RIGHT = Object.freeze({ up: false, down: false, left: false, right: true });
const DIR_UP_RIGHT = Object.freeze({ up: true, down: false, left: false, right: true });
const DIR_UP = Object.freeze({ up: true, down: false, left: false, right: false });
const DIR_UP_LEFT = Object.freeze({ up: true, down: false, left: true, right: false });
const DIR_LEFT = Object.freeze({ up: false, down: false, left: true, right: false });
const DIR_DOWN_LEFT = Object.freeze({ up: false, down: true, left: true, right: false });
const DIR_DOWN = Object.freeze({ up: false, down: true, left: false, right: false });
const DIR_DOWN_RIGHT = Object.freeze({ up: false, down: true, left: false, right: true });

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
    return DIR_NONE;
  }

  // Guard against invalid, NaN, non-finite, or sub-deadzone distance (< 5px)
  if (
    distance !== undefined &&
    (typeof distance !== 'number' || !Number.isFinite(distance) || Number.isNaN(distance) || distance < 5)
  ) {
    return DIR_NONE;
  }

  const norm = ((angle % 360) + 360) % 360;
  if (norm < 22.5) return DIR_RIGHT;
  if (norm <= 67.5) return DIR_UP_RIGHT;
  if (norm < 112.5) return DIR_UP;
  if (norm <= 157.5) return DIR_UP_LEFT;
  if (norm < 202.5) return DIR_LEFT;
  if (norm <= 247.5) return DIR_DOWN_LEFT;
  if (norm < 292.5) return DIR_DOWN;
  if (norm <= 337.5) return DIR_DOWN_RIGHT;
  return DIR_RIGHT;
}

/**
 * Resolves joystick direction directly from raw coordinate offsets (dx, dy).
 * Computes angle and euclidean distance while strictly handling (0,0), NaN, and non-finite values.
 */
export interface JoystickVectorResult {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  angle: number;
  distance: number;
}

/**
 * Resolves joystick direction directly from raw coordinate offsets (dx, dy).
 * Computes angle and euclidean distance while strictly handling (0,0), NaN, and non-finite values.
 */
export function resolveJoystickVector(
  dx: number,
  dy: number,
  deadzone: number = 5,
  out?: JoystickVectorResult
): JoystickVectorResult {
  const result: JoystickVectorResult = out ?? {
    up: false,
    down: false,
    left: false,
    right: false,
    angle: 0,
    distance: 0,
  };

  if (
    typeof dx !== 'number' ||
    typeof dy !== 'number' ||
    !Number.isFinite(dx) ||
    !Number.isFinite(dy) ||
    Number.isNaN(dx) ||
    Number.isNaN(dy)
  ) {
    result.up = false;
    result.down = false;
    result.left = false;
    result.right = false;
    result.angle = 0;
    result.distance = 0;
    return result;
  }

  const effectiveDeadzone =
    typeof deadzone === 'number' && Number.isFinite(deadzone) && deadzone >= 0 ? deadzone : 5;
  const distSq = dx * dx + dy * dy;
  if (!Number.isFinite(distSq)) {
    result.up = false;
    result.down = false;
    result.left = false;
    result.right = false;
    result.angle = 0;
    result.distance = 0;
    return result;
  }

  const distance = Math.sqrt(distSq);
  result.distance = distance;

  // Sub-deadzone check with float tolerance to ensure exact boundary radius (e.g. 5.0px) is active
  const deadzoneSq = effectiveDeadzone * effectiveDeadzone;
  if (effectiveDeadzone > 0 ? distSq < deadzoneSq - 1e-7 : distSq <= 1e-12) {
    result.up = false;
    result.down = false;
    result.left = false;
    result.right = false;
    result.angle = 0;
    if (distSq <= 1e-12) {
      result.distance = 0;
    }
    return result;
  }

  // Math.atan2(dy, dx) returns radians. In standard screen coordinates, dy points downwards.
  // Converting screen dy (inverted y) to standard mathematical angle (0=Right, 90=Up, 180=Left, 270=Down):
  let deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  if (Object.is(deg, -0) || deg === 0) deg = 0;

  const norm = ((deg % 360) + 360) % 360;
  result.up = norm >= 22.5 && norm <= 157.5;
  result.down = norm >= 202.5 && norm <= 337.5;
  result.left = norm >= 112.5 && norm <= 247.5;
  result.right = norm <= 67.5 || norm >= 292.5;
  result.angle = deg;
  result.distance = distance;
  return result;
}

/**
 * Resets directional movement flags on the given state in-place.
 */
export function resetJoystickDirection(state: MobileInputState): void {
  if (!state) return;
  state.up = false;
  state.down = false;
  state.left = false;
  state.right = false;
}

/**
 * Resets all mobile input states immediately.
 */
export function resetAllMobileInputs(state: MobileInputState): void {
  if (!state) return;
  state.up = false;
  state.down = false;
  state.left = false;
  state.right = false;
  state.bomb = false;
  state.dash = false;
  state.ultimate = false;
}

/**
 * Resolves simultaneous contradictory directional inputs (SOCD Cleaner).
 * Under standard neutral SOCD rules:
 * - Opposing vertical directions (UP + DOWN) neutralize to false.
 * - Opposing horizontal directions (LEFT + RIGHT) neutralize to false.
 * Guarantees the invariant: !(state.up && state.down) && !(state.left && state.right).
 */
export function resolveContradictoryDirections(
  stateOrUp: MobileInputState | boolean,
  policyOrDown: 'neutral' | 'cancel' | boolean = 'neutral',
  argLeft?: boolean,
  argRight?: boolean
): MobileInputState | { up: boolean; down: boolean; left: boolean; right: boolean } {
  if (typeof stateOrUp === 'boolean') {
    let up = Boolean(stateOrUp);
    let down = Boolean(policyOrDown);
    let left = Boolean(argLeft);
    let right = Boolean(argRight);
    if (up && down) {
      up = false;
      down = false;
    }
    if (left && right) {
      left = false;
      right = false;
    }
    return { up, down, left, right };
  }

  const state = stateOrUp;
  if (!state) return state;
  void policyOrDown;
  if (state.up && state.down) {
    state.up = false;
    state.down = false;
  }
  if (state.left && state.right) {
    state.left = false;
    state.right = false;
  }
  return state;
}

/**
 * Checks whether the input state currently has contradictory opposing cardinal directions.
 */
export function hasContradictoryDirections(state: MobileInputState): boolean {
  if (!state) return false;
  return Boolean((state.up && state.down) || (state.left && state.right));
}

/**
 * Sanitizes the MobileInputState against malformed types, NaN, and contradictory directions.
 * Guarantees all fields are strictly booleans and no opposing cardinal axes are active simultaneously.
 */
export function sanitizeMobileInputState(state: MobileInputState): MobileInputState {
  if (!state) return createDefaultMobileInputState();
  state.up = Boolean(state.up);
  state.down = Boolean(state.down);
  state.left = Boolean(state.left);
  state.right = Boolean(state.right);
  state.bomb = Boolean(state.bomb);
  state.dash = Boolean(state.dash);
  state.ultimate = Boolean(state.ultimate);

  resolveContradictoryDirections(state);
  return state;
}

const defaultFallbackScheduler: (cb: () => void) => void =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb: () => void) => { setTimeout(cb, 16); };

/**
 * High-reliability action button activation with frame-synchronized double-RAF fallback.
 * Prevents input drops and eliminates permanent "sticky button" state if pointer events are dropped.
 */
export function triggerMobileAction(
  state: MobileInputState,
  action: 'bomb' | 'dash' | 'ultimate',
  scheduler?: (cb: () => void) => void,
  shouldKeepActive?: () => boolean
): void {
  if (!state || (action !== 'bomb' && action !== 'dash' && action !== 'ultimate')) return;
  state[action] = true;
  const schedule = scheduler ?? (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : defaultFallbackScheduler);

  schedule(() => {
    schedule(() => {
      if (!shouldKeepActive || !shouldKeepActive()) {
        state[action] = false;
      }
    });
  });
}

/**
 * Immediate cancellation of an action input upon pointer cancel.
 */
export function cancelMobileAction(state: MobileInputState, action: 'bomb' | 'dash' | 'ultimate'): void {
  if (state && (action === 'bomb' || action === 'dash' || action === 'ultimate')) {
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
  if (!state || (action !== 'bomb' && action !== 'dash' && action !== 'ultimate')) return;
  const schedule = scheduler ?? (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : defaultFallbackScheduler);

  schedule(() => {
    state[action] = false;
  });
}

/**
 * Button Action Debouncer
 * Protects against capacitive touch jitter, bounce oscillations, and rapid tap flooding.
 * Enforces per-action minimum inter-trigger intervals (debounce window).
 */
export class ButtonDebouncer {
  private lastTriggerTimes: Map<string, number> = new Map();
  private defaultWindowMs: number;
  private actionWindows: Map<string, number> = new Map();

  constructor(defaultWindowMs: number = 50) {
    this.defaultWindowMs =
      typeof defaultWindowMs === 'number' && Number.isFinite(defaultWindowMs) && defaultWindowMs >= 0
        ? defaultWindowMs
        : 50;
  }

  public setDebounceWindow(action: TouchControlTarget | string, windowMs: number): void {
    if (typeof windowMs === 'number' && Number.isFinite(windowMs) && windowMs >= 0) {
      this.actionWindows.set(action, windowMs);
    }
  }

  public getDebounceWindow(action: TouchControlTarget | string): number {
    return this.actionWindows.get(action) ?? this.defaultWindowMs;
  }

  public canTrigger(action: TouchControlTarget | string, now?: number, customWindowMs?: number): boolean {
    if (!action) return false;
    const currentTime =
      typeof now === 'number' && Number.isFinite(now)
        ? now
        : typeof performance !== 'undefined'
          ? performance.now()
          : Date.now();

    const lastTime = this.lastTriggerTimes.get(action);
    if (lastTime === undefined) {
      return true;
    }

    const window =
      typeof customWindowMs === 'number' && Number.isFinite(customWindowMs) && customWindowMs >= 0
        ? customWindowMs
        : this.getDebounceWindow(action);

    return currentTime - lastTime >= window;
  }

  public recordTrigger(action: TouchControlTarget | string, now?: number): void {
    const currentTime =
      typeof now === 'number' && Number.isFinite(now)
        ? now
        : typeof performance !== 'undefined'
          ? performance.now()
          : Date.now();
    this.lastTriggerTimes.set(action, currentTime);
  }

  public tryTrigger(action: TouchControlTarget | string, now?: number, customWindowMs?: number): boolean {
    if (this.canTrigger(action, now, customWindowMs)) {
      this.recordTrigger(action, now);
      return true;
    }
    return false;
  }

  public isDebounced(action: TouchControlTarget | string, now?: number, customWindowMs?: number): boolean {
    return !this.canTrigger(action, now, customWindowMs);
  }

  public getLastTriggerTime(action: TouchControlTarget | string): number {
    return this.lastTriggerTimes.get(action) ?? -1;
  }

  public reset(action?: TouchControlTarget | string): void {
    if (action) {
      this.lastTriggerTimes.delete(action);
    } else {
      this.lastTriggerTimes.clear();
    }
  }
}

/**
 * Debounced action button activation with frame-synchronized double-RAF fallback.
 * Enforces minimum debounce window before activating the action.
 * Returns true if the action was accepted and triggered, false if debounced/suppressed.
 */
export function triggerMobileActionDebounced(
  state: MobileInputState,
  action: 'bomb' | 'dash' | 'ultimate',
  debounceWindowMs: number = 50,
  debouncer?: ButtonDebouncer,
  now?: number,
  scheduler?: (cb: () => void) => void,
  shouldKeepActive?: () => boolean
): boolean {
  if (!state) return false;

  if (debouncer) {
    if (!debouncer.tryTrigger(action, now, debounceWindowMs)) {
      return false;
    }
  }

  triggerMobileAction(state, action, scheduler, shouldKeepActive);
  return true;
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

export interface MultiTouchPointerTrackerOptions {
  debounceMs?: number;
  actionDebounceMs?: Partial<Record<TouchControlTarget, number>>;
}

/**
 * Enterprise Multi-Touch Pointer Tracker & Collision Arbitrator.
 * Tracks concurrent touch pointer IDs, arbitrates pointer ID collisions / re-use,
 * isolates multi-finger control bindings, enforces button debounce invariants,
 * and recovers orphaned / dropped touch events cleanly.
 */
export class MultiTouchPointerTracker {
  private activePointers: Map<number, ActivePointerRecord> = new Map();
  private controlActivePointers: Map<TouchControlTarget, Set<number>> = new Map([
    ['joystick', new Set<number>()],
    ['bomb', new Set<number>()],
    ['dash', new Set<number>()],
    ['ultimate', new Set<number>()],
  ]);
  private debouncer: ButtonDebouncer;
  private recordPool: ActivePointerRecord[] = [];

  constructor(options?: MultiTouchPointerTrackerOptions) {
    this.debouncer = new ButtonDebouncer(options?.debounceMs ?? 0);
    if (options?.actionDebounceMs) {
      for (const [target, ms] of Object.entries(options.actionDebounceMs)) {
        if (typeof ms === 'number') {
          this.debouncer.setDebounceWindow(target, ms);
        }
      }
    }
  }

  private acquireRecord(
    pointerId: number,
    target: TouchControlTarget,
    timestamp: number,
    coords?: { x: number; y: number }
  ): ActivePointerRecord {
    const validX =
      coords && typeof coords.x === 'number' && Number.isFinite(coords.x) ? coords.x : undefined;
    const validY =
      coords && typeof coords.y === 'number' && Number.isFinite(coords.y) ? coords.y : undefined;

    const record = this.recordPool.pop();
    if (record) {
      record.pointerId = pointerId;
      record.target = target;
      record.timestamp = timestamp;
      record.startX = validX;
      record.startY = validY;
      record.currentX = validX;
      record.currentY = validY;
      return record;
    }
    return {
      pointerId,
      target,
      timestamp,
      startX: validX,
      startY: validY,
      currentX: validX,
      currentY: validY,
    };
  }

  private releaseRecord(record: ActivePointerRecord): void {
    record.startX = undefined;
    record.startY = undefined;
    record.currentX = undefined;
    record.currentY = undefined;
    if (this.recordPool.length < 64) {
      this.recordPool.push(record);
    }
  }

  public setButtonDebounce(target: TouchControlTarget, debounceMs: number): void {
    this.debouncer.setDebounceWindow(target, debounceMs);
  }

  public getButtonDebounce(target: TouchControlTarget): number {
    return this.debouncer.getDebounceWindow(target);
  }

  public isButtonDebounced(target: TouchControlTarget, now?: number): boolean {
    if (target === 'joystick') return false; // Joystick is continuous, never debounced
    return this.debouncer.isDebounced(target, now);
  }

  public getDebouncer(): ButtonDebouncer {
    return this.debouncer;
  }

  /**
   * Refreshes the activity timestamp of an active pointer.
   * Useful for steady holds (e.g. continuous button press or motionless joystick hold)
   * to inform the watchdog timer that the touch is actively maintained and not orphaned.
   */
  public refreshPointer(pointerId: number, timestamp?: number): boolean {
    const record = this.activePointers.get(pointerId);
    if (!record) return false;
    const now =
      typeof timestamp === 'number' && Number.isFinite(timestamp)
        ? timestamp
        : typeof performance !== 'undefined'
          ? performance.now()
          : Date.now();
    record.timestamp = now;
    return true;
  }

  /**
   * Tracks a pointerdown / touchstart event.
   * If the pointerId is already registered to another control (ID collision or re-use without touchend),
   * the previous association is gracefully released first.
   * Returns true if the action was accepted, false if debounced/suppressed or rejected.
   */
  public onPointerDown(
    pointerId: number,
    target: TouchControlTarget,
    state: MobileInputState,
    coords?: { x: number; y: number },
    scheduler?: (cb: () => void) => void,
    timestamp?: number
  ): boolean {
    if (!state) return false;
    if (typeof pointerId !== 'number' || !Number.isFinite(pointerId)) return false;
    const targetSet = this.controlActivePointers.get(target);
    if (!targetSet) return false;

    // Handle collision: if pointerId was already active on another target, clean it up
    const existing = this.activePointers.get(pointerId);
    if (existing && existing.target !== target) {
      this.releasePointerFromTarget(pointerId, existing.target, state);
      existing.target = target;
    }

    const now =
      typeof timestamp === 'number' && Number.isFinite(timestamp)
        ? timestamp
        : typeof performance !== 'undefined'
          ? performance.now()
          : Date.now();

    const validX =
      coords && typeof coords.x === 'number' && Number.isFinite(coords.x) ? coords.x : undefined;
    const validY =
      coords && typeof coords.y === 'number' && Number.isFinite(coords.y) ? coords.y : undefined;

    if (existing) {
      targetSet.add(pointerId);
      existing.timestamp = now;
      existing.startX = validX;
      existing.startY = validY;
      existing.currentX = validX;
      existing.currentY = validY;
    } else {
      const record = this.acquireRecord(pointerId, target, now, coords);
      this.activePointers.set(pointerId, record);
      targetSet.add(pointerId);
    }

    // Apply state change with debounce verification
    if (target !== 'joystick') {
      const windowMs = this.debouncer.getDebounceWindow(target);
      if (windowMs > 0) {
        if (!this.debouncer.tryTrigger(target, now)) {
          // Debounced: pointer is tracked for multi-finger release integrity, but impulse is suppressed
          return false;
        }
      } else {
        this.debouncer.recordTrigger(target, now);
      }
      triggerMobileAction(
        state,
        target,
        scheduler,
        () => (this.controlActivePointers.get(target)?.size ?? 0) > 0
      );
    }
    return true;
  }

  /**
   * Tracks pointermove / touchmove.
   * Updates coordinates, validates against NaN, and updates joystick direction if target is joystick.
   */
  public onPointerMove(
    pointerId: number,
    coords: { x: number; y: number },
    state: MobileInputState,
    origin?: { x: number; y: number },
    timestamp?: number
  ): void {
    if (!state) return;
    if (typeof pointerId !== 'number' || !Number.isFinite(pointerId)) return;
    const record = this.activePointers.get(pointerId);
    if (!record) return;

    if (
      !coords ||
      typeof coords.x !== 'number' ||
      typeof coords.y !== 'number' ||
      !Number.isFinite(coords.x) ||
      !Number.isFinite(coords.y)
    ) {
      // If coordinates are invalid or NaN, zero out joystick movement if this is the joystick
      if (record.target === 'joystick') {
        resetJoystickDirection(state);
      }
      return;
    }

    const now =
      typeof timestamp === 'number' && Number.isFinite(timestamp)
        ? timestamp
        : typeof performance !== 'undefined'
          ? performance.now()
          : Date.now();
    record.timestamp = now;

    record.currentX = coords.x;
    record.currentY = coords.y;

    if (record.target === 'joystick') {
      if (record.startX === undefined || !Number.isFinite(record.startX)) {
        record.startX = coords.x;
        record.startY = coords.y;
      }

      const ox = origin && Number.isFinite(origin.x) ? origin.x : record.startX;
      const oy = origin && Number.isFinite(origin.y) ? origin.y : record.startY;

      if (ox !== undefined && oy !== undefined && Number.isFinite(ox) && Number.isFinite(oy)) {
        const dx = coords.x - ox;
        const dy = coords.y - oy;
        const distSq = dx * dx + dy * dy;
        if (!Number.isFinite(distSq) || distSq < 25) {
          state.up = false;
          state.down = false;
          state.left = false;
          state.right = false;
        } else {
          let deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
          if (deg < 0) deg += 360;
          const norm = ((deg % 360) + 360) % 360;
          state.up = norm >= 22.5 && norm <= 157.5;
          state.down = norm >= 202.5 && norm <= 337.5;
          state.left = norm >= 112.5 && norm <= 247.5;
          state.right = norm <= 67.5 || norm >= 292.5;
          resolveContradictoryDirections(state);
        }
      } else {
        resetJoystickDirection(state);
      }
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
    if (!state) return;
    if (typeof pointerId !== 'number' || !Number.isFinite(pointerId)) return;
    const record = this.activePointers.get(pointerId);
    if (!record) return;

    this.activePointers.delete(pointerId);
    this.releaseRecord(record);
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
    if (!state) return;
    if (typeof pointerId !== 'number' || !Number.isFinite(pointerId)) return;
    const record = this.activePointers.get(pointerId);
    if (!record) return;

    this.activePointers.delete(pointerId);
    this.releaseRecord(record);
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
   * Immediately clears all tracked pointers and releases any active targets.
   * Call upon system touchcancel, window blur, modal opening, or pagehide.
   */
  public cancelAllPointers(state: MobileInputState): void {
    for (const record of this.activePointers.values()) {
      this.releaseRecord(record);
    }
    this.activePointers.clear();
    for (const set of this.controlActivePointers.values()) {
      set.clear();
    }
    if (state) {
      resetAllMobileInputs(state);
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
    if (!state) return 0;
    const effectiveMaxAge =
      typeof maxAgeMs === 'number' && Number.isFinite(maxAgeMs) && maxAgeMs >= 0 ? maxAgeMs : 3000;
    const now =
      typeof currentTime === 'number' && Number.isFinite(currentTime)
        ? currentTime
        : typeof performance !== 'undefined'
          ? performance.now()
          : Date.now();
    let recoveredCount = 0;

    for (const [pointerId, record] of this.activePointers.entries()) {
      if (now - record.timestamp > effectiveMaxAge) {
        this.activePointers.delete(pointerId);
        this.releaseRecord(record);
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

    if (recoveredCount > 0 && this.activePointers.size === 0) {
      resetAllMobileInputs(state);
    }

    return recoveredCount;
  }

  /**
   * Resets all pointer tracking and zeroes the input state.
   */
  public reset(state?: MobileInputState): void {
    for (const record of this.activePointers.values()) {
      this.releaseRecord(record);
    }
    this.activePointers.clear();
    for (const set of this.controlActivePointers.values()) {
      set.clear();
    }
    this.debouncer.reset();
    if (state) {
      resetAllMobileInputs(state);
    }
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
    if (!state) return;
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

