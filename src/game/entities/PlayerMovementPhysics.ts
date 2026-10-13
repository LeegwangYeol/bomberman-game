/**
 * Player Movement Physics & Numerical Stability Engine
 *
 * Guarantees:
 * 1. Subnormal Float Protections: Values with magnitude < 1e-8 are flushed to 0.0 or safe defaults,
 *    preventing IEEE-754 denormalized floating-point CPU stalls.
 * 2. NaN Guards: Rejects NaN, +Infinity, -Infinity, non-finite values, and invalid types across
 *    all coordinate, velocity, and modifier inputs.
 * 3. Deadzone Boundary Checks (IEEE-754 Tolerance): Strict boundary epsilon tolerance
 *    (distSq < deadzoneSq - 1e-7) ensures exact boundary coordinates (e.g. Pythagorean (3, 4) at R=5.0)
 *    never suffer from precision jitter or dropped inputs.
 * 4. Zero-Division Defenses: Denominator guards (denominator >= 1e-8 or 1e-12) eliminate 0/0 and
 *    x/0 operations across vector normalization, speed scaling, and angle computation.
 */

import { clamp, clampSpeed, clampVelocity, normalizeVector } from './SpatialSeparation.ts';

export { clamp, clampSpeed, clampVelocity, normalizeVector };

export const BASE_PLAYER_SPEED = 150;
export const MIN_PLAYER_SPEED = 50;
export const MAX_PLAYER_SPEED_CLAMP = 350;
export const DASH_SPEED = 320;
export const DEFAULT_CORNER_SLIDE_TOLERANCE = 8;
export const MOBILE_CORNER_SLIDE_TOLERANCE = 14;

/** IEEE-754 epsilon tolerance for subnormal float flushing */
export const FLOAT_EPSILON = 1e-8;
/** IEEE-754 squared tolerance for deadzone boundary checks */
export const DEADZONE_EPSILON = 1e-7;

export interface SpeedCalculationOptions {
  baseSpeed?: number;
  itemSpeed?: number;
  perkSpeedBonus?: number;
  surgeBonus?: number;
  customBonus?: number;
  isDashing?: boolean;
  dashSpeed?: number;
  speedMultiplier?: number;
  phaseJitterActive?: boolean;
  slowdownRatio?: number;
}

/**
 * Calculates effective player movement speed with strict bounds enforcement:
 * - Strictly clamped within [MIN_PLAYER_SPEED, MAX_PLAYER_SPEED_CLAMP] = [50, 350] px/s
 * - Handles buff stacking (Speed Up, Speed Surge, Dash, Second Wind, Perks)
 * - Handles debuff stacking (Phase Jitter, Floor Slowdown)
 * - Rejects and sanitizes corrupt, negative, NaN, Infinity, and subnormal inputs
 */
export function calculateClampedPlayerSpeed(options?: SpeedCalculationOptions): number {
  if (!options || typeof options !== 'object') {
    return BASE_PLAYER_SPEED;
  }

  // 1. Base speed resolution & sanitization
  const rawBase = options.itemSpeed !== undefined ? options.itemSpeed : options.baseSpeed;
  const base =
    typeof rawBase === 'number' && Number.isFinite(rawBase) && rawBase >= FLOAT_EPSILON
      ? rawBase
      : BASE_PLAYER_SPEED;

  // 2. Additive bonuses (perks, surge, custom) with subnormal float defense
  const perkBonus =
    typeof options.perkSpeedBonus === 'number' &&
    Number.isFinite(options.perkSpeedBonus) &&
    Math.abs(options.perkSpeedBonus) >= FLOAT_EPSILON
      ? Math.max(0, options.perkSpeedBonus)
      : 0;
  const surgeBonus =
    typeof options.surgeBonus === 'number' &&
    Number.isFinite(options.surgeBonus) &&
    Math.abs(options.surgeBonus) >= FLOAT_EPSILON
      ? Math.max(0, options.surgeBonus)
      : 0;
  const customBonus =
    typeof options.customBonus === 'number' &&
    Number.isFinite(options.customBonus) &&
    Math.abs(options.customBonus) >= FLOAT_EPSILON
      ? options.customBonus
      : 0;

  // 3. Dash base velocity replacement
  let currentSpeed = base + perkBonus;
  if (options.isDashing) {
    const rawDash = options.dashSpeed;
    const dSpeed =
      typeof rawDash === 'number' &&
      Number.isFinite(rawDash) &&
      rawDash > FLOAT_EPSILON
        ? rawDash
        : DASH_SPEED;
    currentSpeed = dSpeed;
  }

  // Add surge and custom additive bonuses
  currentSpeed += surgeBonus + customBonus;

  // 4. Multipliers (e.g. Second Wind, Phase Shift)
  if (
    typeof options.speedMultiplier === 'number' &&
    Number.isFinite(options.speedMultiplier) &&
    options.speedMultiplier > FLOAT_EPSILON
  ) {
    currentSpeed *= options.speedMultiplier;
  }

  // 5. Debuff multipliers:
  // Phase Jitter debuff reduces speed by -25% (0.75x)
  if (options.phaseJitterActive) {
    currentSpeed *= 0.75;
  }

  // Floor hazard slowdown (e.g. 0.5 for -50%)
  if (
    typeof options.slowdownRatio === 'number' &&
    Number.isFinite(options.slowdownRatio) &&
    options.slowdownRatio > FLOAT_EPSILON
  ) {
    const clampedSlow = Math.min(0.9, Math.max(0, options.slowdownRatio));
    currentSpeed *= 1 - clampedSlow;
  }

  // 6. Strict Clamp within [MIN_PLAYER_SPEED, MAX_PLAYER_SPEED_CLAMP] = [50, 350]
  if (!Number.isFinite(currentSpeed) || Number.isNaN(currentSpeed)) {
    return BASE_PLAYER_SPEED;
  }

  return Math.min(
    MAX_PLAYER_SPEED_CLAMP,
    Math.max(MIN_PLAYER_SPEED, Math.round(currentSpeed))
  );
}

export interface JoystickDeadzoneResult {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  angle: number;
  distance: number;
  isActive: boolean;
}

/**
 * Resolves joystick directional vector with IEEE-754 deadzone tolerance and zero-division defense.
 * Subnormal float inputs are flushed to 0.0, and boundary coordinates (e.g. Pythagorean (3, 4) at 5.0px)
 * are accepted without floating-point roundoff dropouts.
 */
export function resolveJoystickDeadzone(
  dx: number,
  dy: number,
  deadzone: number = 5
): JoystickDeadzoneResult {
  const result: JoystickDeadzoneResult = {
    up: false,
    down: false,
    left: false,
    right: false,
    angle: 0,
    distance: 0,
    isActive: false,
  };

  // Guard against non-numeric, NaN, or non-finite coordinates & deadzone
  if (
    typeof dx !== 'number' ||
    typeof dy !== 'number' ||
    !Number.isFinite(dx) ||
    !Number.isFinite(dy) ||
    (deadzone !== undefined && (!Number.isFinite(deadzone) || deadzone < 0))
  ) {
    return result;
  }

  // Subnormal float protection: flush tiny noise coordinates to 0.0
  const safeDx = Math.abs(dx) < FLOAT_EPSILON ? 0 : dx;
  const safeDy = Math.abs(dy) < FLOAT_EPSILON ? 0 : dy;

  const effectiveDeadzone =
    typeof deadzone === 'number' && Number.isFinite(deadzone) && deadzone >= 0
      ? deadzone
      : 5;

  const distSq = safeDx * safeDx + safeDy * safeDy;
  if (!Number.isFinite(distSq)) {
    return result;
  }

  const distance = Math.sqrt(distSq);
  result.distance = distance;

  // Zero-division & Sub-deadzone check with IEEE-754 tolerance
  const deadzoneSq = effectiveDeadzone * effectiveDeadzone;
  if (effectiveDeadzone > 0 ? distSq < deadzoneSq - DEADZONE_EPSILON : distSq <= 1e-12) {
    if (distSq <= 1e-12) {
      result.distance = 0;
    }
    return result;
  }

  // Valid active direction: compute angle in degrees
  let deg = (Math.atan2(-safeDy, safeDx) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  if (Object.is(deg, -0) || deg === 0) deg = 0;

  const norm = ((deg % 360) + 360) % 360;
  result.up = norm >= 22.5 && norm <= 157.5;
  result.down = norm >= 202.5 && norm <= 337.5;
  result.left = norm >= 112.5 && norm <= 247.5;
  result.right = norm <= 67.5 || norm >= 292.5;
  result.angle = deg;
  result.isActive = result.up || result.down || result.left || result.right;

  // SOCD Neutralization (simultaneous opposing cardinal axes cancel to false)
  if (result.up && result.down) {
    result.up = false;
    result.down = false;
  }
  if (result.left && result.right) {
    result.left = false;
    result.right = false;
  }
  result.isActive = result.up || result.down || result.left || result.right;

  return result;
}

export interface CornerSlideParams {
  px: number;
  py: number;
  wantX: number;
  wantY: number;
  primaryAxis: 'x' | 'y';
  speed: number;
  slideSpeed: number;
  delta?: number;
  tileSize?: number;
  tolerance?: number;
  isPassable: (row: number, col: number) => boolean;
}

export interface CornerSlideResult {
  vx: number;
  vy: number;
  snappedX?: number;
  snappedY?: number;
  facing: 'up' | 'down' | 'left' | 'right';
}

/**
 * Resolves player corridor centering and corner sliding physics.
 * Protects against division by zero on tile sizing, subnormal coordinate deltas,
 * and NaN velocity injection.
 */
export function resolvePlayerCornerSlide(params: CornerSlideParams): CornerSlideResult {
  const {
    px,
    py,
    wantX,
    wantY,
    primaryAxis,
    speed,
    slideSpeed,
    delta = 16.666,
    tileSize = 40,
    tolerance = DEFAULT_CORNER_SLIDE_TOLERANCE,
    isPassable,
  } = params;

  const safePx = Number.isFinite(px) ? (Math.abs(px) < FLOAT_EPSILON ? 0 : px) : 200;
  const safePy = Number.isFinite(py) ? (Math.abs(py) < FLOAT_EPSILON ? 0 : py) : 200;
  const safeTileSize = Number.isFinite(tileSize) && tileSize >= 8 ? tileSize : 40;
  const safeDelta = Number.isFinite(delta) && delta >= 0 ? delta : 16.666;
  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : BASE_PLAYER_SPEED;
  const safeSlideSpeed = Number.isFinite(slideSpeed) && slideSpeed > 0 ? slideSpeed : safeSpeed;
  const safeTol = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : DEFAULT_CORNER_SLIDE_TOLERANCE;

  const col = Math.floor(safePx / safeTileSize);
  const row = Math.floor(safePy / safeTileSize);

  const colCenterX = col * safeTileSize + safeTileSize / 2;
  const rowCenterY = row * safeTileSize + safeTileSize / 2;

  const diffX = safePx - colCenterX;
  const diffY = safePy - rowCenterY;

  const snapThreshold = Math.max(2, safeSpeed * (safeDelta / 1000));

  let vx = 0;
  let vy = 0;
  let snappedX: number | undefined;
  let snappedY: number | undefined;
  let facing: 'up' | 'down' | 'left' | 'right' = 'down';

  if (primaryAxis === 'x') {
    vx = wantX * safeSpeed;
    facing = wantX < 0 ? 'left' : 'right';

    const nextCol = col + wantX;
    const directOpen = isPassable(row, nextCol);

    if (directOpen) {
      if (Math.abs(diffY) > snapThreshold) {
        vy = -Math.sign(diffY) * safeSlideSpeed;
      } else {
        snappedY = rowCenterY;
        vy = 0;
      }
    } else {
      const canRoundUp =
        diffY <= 0 &&
        Math.abs(diffY) <= safeTol &&
        isPassable(row - 1, col) &&
        isPassable(row - 1, nextCol);
      const canRoundDown =
        diffY >= 0 &&
        Math.abs(diffY) <= safeTol &&
        isPassable(row + 1, col) &&
        isPassable(row + 1, nextCol);

      if (canRoundUp && canRoundDown) {
        vy = diffY < 0 ? -safeSlideSpeed : diffY > 0 ? safeSlideSpeed : -safeSlideSpeed;
      } else if (canRoundUp) {
        vy = -safeSlideSpeed;
      } else if (canRoundDown) {
        vy = safeSlideSpeed;
      } else {
        vy = 0;
      }
    }
  } else {
    vy = wantY * safeSpeed;
    facing = wantY < 0 ? 'up' : 'down';

    const nextRow = row + wantY;
    const directOpen = isPassable(nextRow, col);

    if (directOpen) {
      if (Math.abs(diffX) > snapThreshold) {
        vx = -Math.sign(diffX) * safeSlideSpeed;
      } else {
        snappedX = colCenterX;
        vx = 0;
      }
    } else {
      const canRoundLeft =
        diffX <= 0 &&
        Math.abs(diffX) <= safeTol &&
        isPassable(row, col - 1) &&
        isPassable(nextRow, col - 1);
      const canRoundRight =
        diffX >= 0 &&
        Math.abs(diffX) <= safeTol &&
        isPassable(row, col + 1) &&
        isPassable(nextRow, col + 1);

      if (canRoundLeft && canRoundRight) {
        vx = diffX < 0 ? -safeSlideSpeed : diffX > 0 ? safeSlideSpeed : -safeSlideSpeed;
      } else if (canRoundLeft) {
        vx = -safeSlideSpeed;
      } else if (canRoundRight) {
        vx = safeSlideSpeed;
      } else {
        vx = 0;
      }
    }
  }

  return {
    vx: Number.isFinite(vx) ? (Math.abs(vx) < FLOAT_EPSILON ? 0 : vx) : 0,
    vy: Number.isFinite(vy) ? (Math.abs(vy) < FLOAT_EPSILON ? 0 : vy) : 0,
    snappedX,
    snappedY,
    facing,
  };
}

/**
 * Clamps 2D player velocity vector within [minSpeed, maxSpeed].
 * Preserves direction while enforcing finite numeric guarantees.
 */
export function clampPlayerVelocity(
  vx: number,
  vy: number,
  minSpeed: number = MIN_PLAYER_SPEED,
  maxSpeed: number = MAX_PLAYER_SPEED_CLAMP
): { vx: number; vy: number; speed: number } {
  return clampVelocity(vx, vy, minSpeed, maxSpeed);
}
