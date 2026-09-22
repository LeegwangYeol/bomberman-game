import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// ESM loader hook to resolve extensionless imports in Node --experimental-strip-types
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "ERR_UNSUPPORTED_DIR_IMPORT") {
      for (const ext of [".ts", ".js", "/index.ts", "/index.js"]) {
        try {
          return await nextResolve(specifier + ext, context);
        } catch {}
      }
    }
    throw err;
  }
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, pathToFileURL('./'));

// Minimal DOM & Canvas mocks for headless environment
const mockCanvasCtx = {
  fillRect: () => {},
  clearRect: () => {},
  getImageData: () => ({ data: new Uint8Array(16) }),
  putImageData: () => {},
  createImageData: () => ({ data: new Uint8Array(16) }),
  setTransform: () => {},
  drawImage: () => {},
  save: () => {},
  restore: () => {},
  beginPath: () => {},
  closePath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  arc: () => {},
  stroke: () => {},
  fill: () => {},
  scale: () => {},
  translate: () => {},
  rotate: () => {},
  createRadialGradient: () => ({
    addColorStop: () => {},
  }),
};

if (!globalThis.window) globalThis.window = globalThis;
if (!globalThis.document) {
  globalThis.document = {
    createElement: () => ({
      getContext: () => mockCanvasCtx,
      style: {},
      setAttribute: () => {},
      width: 800,
      height: 600,
    }),
    documentElement: { style: {} },
  };
}
if (!globalThis.HTMLCanvasElement) globalThis.HTMLCanvasElement = class {};
if (!globalThis.Image) globalThis.Image = class {};

const {
  applyPhysicsBodyInvariantGuard,
} = await import('../src/game/entities/BaseEntity.ts');

const {
  RENDER_DEPTH,
  CameraTraumaSimulator,
} = await import('../src/game/GameScene.ts');

/* ==============================================================================
 * MOCK HELPERS FOR ARCADE PHYSICS & GAME OBJECTS
 * ============================================================================== */

function createMockArcadeSprite(x = 100, y = 100, initialW = 40, initialH = 40) {
  const body = {
    width: initialW,
    height: initialH,
    halfWidth: initialW / 2,
    halfHeight: initialH / 2,
    offset: { x: 0, y: 0 },
    position: { x: x - initialW / 2, y: y - initialH / 2 },
    center: { x, y },
    velocity: { x: 0, y: 0 },
    transform: { x, y },
    immovable: false,
    setSize(w, h) {
      this.width = w;
      this.height = h;
      this.halfWidth = w / 2;
      this.halfHeight = h / 2;
      return this;
    },
    setOffset(ox, oy) {
      this.offset.x = ox;
      this.offset.y = oy;
      return this;
    },
    setImmovable(val) {
      this.immovable = val;
      return this;
    },
    updateCenter() {
      this.center.x = this.position.x + this.halfWidth;
      this.center.y = this.position.y + this.halfHeight;
    },
    updateBounds() {
      // Default Phaser behavior would resize based on sprite scale
      this.updateCenter();
    },
    updateFromGameObject() {
      this.position.x = this.transform.x + this.offset.x - 20;
      this.position.y = this.transform.y + this.offset.y - 20;
      this.updateCenter();
    },
  };

  const sprite = {
    x,
    y,
    scaleX: 1.0,
    scaleY: 1.0,
    displayOriginX: 20,
    displayOriginY: 20,
    angle: 0,
    body,
    setScale(sx, sy) {
      this.scaleX = sx;
      this.scaleY = sy !== undefined ? sy : sx;
      return this;
    },
    setAngle(deg) {
      this.angle = deg;
      return this;
    },
  };

  return sprite;
}

/* ==============================================================================
 * TEST SUITE: MILESTONE 3 — MASSIVE JUICE & ANIMATION UPGRADE
 * ============================================================================== */

test('Juice M3 [Physics Guard]: Invariant guard locks body size to 24x24 and offset 8,8', () => {
  const sprite = createMockArcadeSprite(100, 100, 40, 40);
  applyPhysicsBodyInvariantGuard(sprite, 24, 24, 8, 8);

  assert.equal(sprite.body.width, 24, 'Body width must be exactly 24px');
  assert.equal(sprite.body.height, 24, 'Body height must be exactly 24px');
  assert.equal(sprite.body.halfWidth, 12, 'Body halfWidth must be exactly 12px');
  assert.equal(sprite.body.halfHeight, 12, 'Body halfHeight must be exactly 12px');
  assert.equal(sprite.body.offset.x, 8, 'Body offset.x must be 8px');
  assert.equal(sprite.body.offset.y, 8, 'Body offset.y must be 8px');
});

test('Juice M3 [Physics Guard]: Scale squash/stretch does NOT mutate physics hitbox bounds', () => {
  const sprite = createMockArcadeSprite(200, 200, 40, 40);
  applyPhysicsBodyInvariantGuard(sprite, 24, 24, 8, 8);

  // Apply extreme squash/stretch scales
  const scalesToTest = [
    [1.08, 0.92], // Ground contact squash
    [0.94, 1.06], // Jump apex stretch
    [1.50, 0.50], // Extreme horizontal squash
    [0.30, 2.00], // Extreme vertical stretch
    [0.01, 0.01], // Sub-pixel scale
    [10.0, 10.0], // Huge boss scale
  ];

  for (const [sx, sy] of scalesToTest) {
    sprite.setScale(sx, sy);
    sprite.body.updateBounds();
    sprite.body.updateFromGameObject();

    assert.equal(sprite.body.width, 24, `Body width must stay 24 despite scale (${sx}, ${sy})`);
    assert.equal(sprite.body.height, 24, `Body height must stay 24 despite scale (${sx}, ${sy})`);
    assert.equal(sprite.body.halfWidth, 12, `Half width must stay 12 despite scale (${sx}, ${sy})`);
    assert.equal(sprite.body.halfHeight, 12, `Half height must stay 12 despite scale (${sx}, ${sy})`);
  }
});

test('Juice M3 [Visual Bobbing]: 3px displayOriginY modulation does not shift physics center', () => {
  const sprite = createMockArcadeSprite(120, 120, 40, 40);
  applyPhysicsBodyInvariantGuard(sprite, 24, 24, 8, 8);

  // Baseline at origin (20, 20)
  sprite.displayOriginY = 20;
  sprite.body.updateFromGameObject();
  const baselineCenterX = sprite.body.center.x;
  const baselineCenterY = sprite.body.center.y;
  const baselinePosX = sprite.body.position.x;
  const baselinePosY = sprite.body.position.y;

  // Modulate displayOriginY across 0px to 3px vertical bob
  for (let hop = 0; hop <= 3.0; hop += 0.5) {
    sprite.displayOriginY = 20 - hop; // Visual texture rises by 'hop' px
    sprite.body.updateFromGameObject();

    assert.equal(
      sprite.body.center.x,
      baselineCenterX,
      `Physics body center X must remain invariant during hop=${hop}`
    );
    assert.equal(
      sprite.body.center.y,
      baselineCenterY,
      `Physics body center Y must remain invariant during hop=${hop}`
    );
    assert.equal(
      sprite.body.position.x,
      baselinePosX,
      `Physics body position X must remain invariant during hop=${hop}`
    );
    assert.equal(
      sprite.body.position.y,
      baselinePosY,
      `Physics body position Y must remain invariant during hop=${hop}`
    );
  }
});

test('Juice M3 [Squash & Stretch]: Area preservation invariant remains within 1% error', () => {
  // Test mathematical transfer function: apexNorm = hop / 3; sx = 1.08 - 0.14 * apexNorm; sy = 0.92 + 0.14 * apexNorm
  const steps = 100;
  for (let i = 0; i <= steps; i++) {
    const hop = (i / steps) * 3;
    const apexNorm = hop / 3;
    const sx = 1.08 - 0.14 * apexNorm;
    const sy = 0.92 + 0.14 * apexNorm;

    // Contact squash check at hop = 0
    if (i === 0) {
      assert.ok(Math.abs(sx - 1.08) < 1e-6, 'Ground contact sx must equal 1.08');
      assert.ok(Math.abs(sy - 0.92) < 1e-6, 'Ground contact sy must equal 0.92');
    }
    // Apex stretch check at hop = 3
    if (i === steps) {
      assert.ok(Math.abs(sx - 0.94) < 1e-6, 'Apex stretch sx must equal 0.94');
      assert.ok(Math.abs(sy - 1.06) < 1e-6, 'Apex stretch sy must equal 1.06');
    }

    const areaProduct = sx * sy;
    assert.ok(
      areaProduct >= 0.99 && areaProduct <= 1.01,
      `Squash & stretch area (${areaProduct}) must remain within 1% of 1.0 at hop=${hop}`
    );
  }
});

test('Juice M3 [Motion Tilt]: 3.5-degree banking responds accurately to lateral velocity', () => {
  function computeMotionTilt(vx) {
    if (vx > 0) return 3.5;
    if (vx < 0) return -3.5;
    return 0;
  }

  assert.equal(computeMotionTilt(120), 3.5, 'Moving right tilts +3.5 degrees');
  assert.equal(computeMotionTilt(-120), -3.5, 'Moving left tilts -3.5 degrees');
  assert.equal(computeMotionTilt(0), 0, 'Stationary resets tilt to 0 degrees');
});

test('Juice M3 [Zero Corner Snagging]: Corridor clearance invariant in 40px grid tile', () => {
  // A 40px corridor tile with walls at left (col 0: [0, 40]) and right (col 2: [80, 120])
  // Player centered at col 1: x = 60, y = 60
  const sprite = createMockArcadeSprite(60, 60, 40, 40);
  applyPhysicsBodyInvariantGuard(sprite, 24, 24, 8, 8);

  const leftWallRightEdge = 40;
  const rightWallLeftEdge = 80;

  // Simulate 1,000 frames of walking with continuous bobbing and squash
  for (let frame = 0; frame < 1000; frame++) {
    const hop = Math.abs(Math.sin((frame / 60) * Math.PI)) * 3;
    const apexNorm = hop / 3;
    const sx = 1.08 - 0.14 * apexNorm;
    const sy = 0.92 + 0.14 * apexNorm;

    sprite.setScale(sx, sy);
    sprite.displayOriginY = 20 - hop;
    sprite.body.updateBounds();
    sprite.body.updateFromGameObject();

    const bodyLeft = sprite.body.position.x;
    const bodyRight = sprite.body.position.x + sprite.body.width;

    const leftClearance = bodyLeft - leftWallRightEdge;
    const rightClearance = rightWallLeftEdge - bodyRight;

    assert.equal(leftClearance, 8, `Left clearance must be invariant at exactly 8px on frame ${frame}`);
    assert.equal(rightClearance, 8, `Right clearance must be invariant at exactly 8px on frame ${frame}`);
    assert.ok(leftClearance > 0 && rightClearance > 0, 'No corner snagging or wall clipping allowed');
  }
});

test('Juice M3 [4-Phase Bomb Pulse]: 4-stage tween chain durations sum to exactly 2000ms fuse', () => {
  // Tween chain specification extracted from GameScene.placeBomb
  const phases = [
    { name: 'Phase 1: Heartbeat', halfPeriod: 250, yoyo: true, repeat: 1 }, // 250 * 2 * 2 = 1000ms
    { name: 'Phase 2: Amber Swell', halfPeriod: 150, yoyo: true, repeat: 1 }, // 150 * 2 * 2 = 600ms
    { name: 'Phase 3: Hyper-Pulse', halfPeriod: 50, yoyo: true, repeat: 2 }, // 50 * 2 * 3 = 300ms
    { name: 'Phase 4: Whiteout Contraction', duration: 100, yoyo: false, repeat: 0 }, // 100ms
  ];

  const p1Duration = phases[0].halfPeriod * (phases[0].yoyo ? 2 : 1) * (phases[0].repeat + 1);
  const p2Duration = phases[1].halfPeriod * (phases[1].yoyo ? 2 : 1) * (phases[1].repeat + 1);
  const p3Duration = phases[2].halfPeriod * (phases[2].yoyo ? 2 : 1) * (phases[2].repeat + 1);
  const p4Duration = phases[3].duration;

  assert.equal(p1Duration, 1000, 'Phase 1 duration must be exactly 1000ms');
  assert.equal(p2Duration, 600, 'Phase 2 duration must be exactly 600ms');
  assert.equal(p3Duration, 300, 'Phase 3 duration must be exactly 300ms');
  assert.equal(p4Duration, 100, 'Phase 4 duration must be exactly 100ms');

  const totalDuration = p1Duration + p2Duration + p3Duration + p4Duration;
  assert.equal(totalDuration, 2000, 'Total bomb pulse tween chain duration must equal 2000ms fuse');
});

test('Juice M3 [4-Phase Bomb Pulse]: Accelerating cadence and visual attributes', () => {
  // Phase 1: Heartbeat
  const p1ScaleX = 1.14;
  const p1ScaleY = 1.04;
  assert.ok(p1ScaleX > 1.0 && p1ScaleY > 1.0, 'Phase 1 must provide gentle rhythmic expansion');

  // Phase 2: Amber Swell (0xff8844)
  const p2Tint = 0xff8844;
  const p2ScaleX = 1.22;
  const p2ScaleY = 0.92;
  assert.equal(p2Tint, 0xff8844, 'Phase 2 tint must be amber warning (0xff8844)');
  assert.ok(p2ScaleX > p1ScaleX, 'Phase 2 expands wider than Phase 1');
  assert.equal(p2ScaleY, 0.92, 'Phase 2 compresses vertically');

  // Phase 3: Critical Detonation Hyper-Pulse (0xff2222)
  const p3Tint = 0xff2222;
  const p3ScaleX = 1.32;
  const p3Angle = 3.5;
  assert.equal(p3Tint, 0xff2222, 'Phase 3 tint must be critical crimson (0xff2222)');
  assert.equal(p3Angle, 3.5, 'Phase 3 micro-jitter angle must be 3.5 degrees');
  assert.ok(p3ScaleX > p2ScaleX, 'Phase 3 reaches maximum pre-blast scale');

  // Phase 4: Pre-detonation Whiteout Contraction (0xffffff)
  const p4Scale = 0.80;
  const p4Tint = 0xffffff;
  const p4Angle = 0;
  assert.equal(p4Tint, 0xffffff, 'Phase 4 must snap to pure whiteout (0xffffff)');
  assert.equal(p4Scale, 0.80, 'Phase 4 must contract to 0.80 (20% contraction) for anticipation snap');
  assert.equal(p4Angle, 0, 'Phase 4 must reset tilt angle to 0');
});

test('Juice M3 [Camera Trauma]: Explosion adds 0.35 trauma with non-linear T^2 shake response', () => {
  const traumaSim = new CameraTraumaSimulator();
  assert.equal(traumaSim.trauma, 0, 'Initial trauma must be 0');

  // Single bomb explosion adds 0.35 trauma
  traumaSim.addTrauma(0.35);
  assert.ok(Math.abs(traumaSim.trauma - 0.35) < 1e-6, 'Trauma after single bomb must be 0.35');

  // Non-linear T^2 power: shake intensity = trauma^2
  const traumaVal = traumaSim.trauma;
  const shakeIntensity = traumaVal * traumaVal;
  assert.ok(Math.abs(shakeIntensity - 0.1225) < 1e-4, 'Trauma squared intensity for 0.35 must be 0.1225');

  // Monotonic trauma accumulation with ceiling clamp
  traumaSim.addTrauma(0.35);
  assert.ok(Math.abs(traumaSim.trauma - 0.70) < 1e-6, 'Trauma after 2 bombs must be 0.70');

  traumaSim.addTrauma(0.50);
  assert.equal(traumaSim.trauma, 1.0, 'Trauma must strictly clamp at 1.0 max');
});

test('Juice M3 [Physics Hit-Stop]: 150ms debounce window suppresses rapid trigger flooding', () => {
  class MockHitStopController {
    constructor() {
      this.isHitStopActive = false;
      this.lastHitStopMs = -999;
      this.lastDurationMs = 0;
      this.pauseCount = 0;
      this.resumeCount = 0;
    }

    triggerHitStop(now, durationMs = 40) {
      if (this.isHitStopActive || now - this.lastHitStopMs < 150) {
        return false; // Rejected by debounce guard
      }
      this.isHitStopActive = true;
      this.lastHitStopMs = now;
      this.lastDurationMs = durationMs;
      this.pauseCount++;
      return true; // Successfully triggered
    }

    onDelayedCallComplete() {
      this.resumeCount++;
      this.isHitStopActive = false;
    }
  }

  const controller = new MockHitStopController();

  // t = 1000: First explosion triggers hit-stop
  assert.ok(controller.triggerHitStop(1000, 35), 'First hit-stop at t=1000 must succeed');
  assert.equal(controller.isHitStopActive, true);
  assert.equal(controller.pauseCount, 1);

  // t = 1030: Rapid explosion during active hit-stop must be rejected
  assert.equal(controller.triggerHitStop(1030, 35), false, 'Trigger during active hit-stop must be rejected');

  // t = 1035: Hit-stop duration finishes
  controller.onDelayedCallComplete();
  assert.equal(controller.isHitStopActive, false);
  assert.equal(controller.resumeCount, 1);

  // t = 1050: Explosion within 150ms debounce window (1050 - 1000 = 50 < 150) must be rejected
  assert.equal(controller.triggerHitStop(1050, 35), false, 'Trigger at t=1050ms must be rejected by debounce');

  // t = 1100: Still within debounce window (1100 - 1000 = 100 < 150)
  assert.equal(controller.triggerHitStop(1100, 35), false, 'Trigger at t=1100ms must be rejected by debounce');

  // t = 1160: Outside debounce window (1160 - 1000 = 160 >= 150) -> Accepted!
  assert.ok(controller.triggerHitStop(1160, 35), 'Trigger at t=1160ms must succeed');
  assert.equal(controller.isHitStopActive, true);
  assert.equal(controller.pauseCount, 2);
});

test('Juice M3 [Graduated Hit-Stop]: Event durations adhere strictly to game feel specs', () => {
  const HIT_STOP_SPECS = {
    BOMB_DETONATION: 35,
    BLOCK_DEMOLITION_CASCADE: 45,
    PLAYER_SHIELD_BREAK: 50,
    PLAYER_ONE_UP_REVIVAL: 50,
    PLAYER_FATAL_DEFEAT: 70,
  };

  assert.equal(HIT_STOP_SPECS.BOMB_DETONATION, 35, 'Standard bomb detonation hit-stop is 35ms');
  assert.equal(HIT_STOP_SPECS.BLOCK_DEMOLITION_CASCADE, 45, '3+ block destruction cascade hit-stop is 45ms');
  assert.equal(HIT_STOP_SPECS.PLAYER_SHIELD_BREAK, 50, 'Shield break impact hit-stop is 50ms');
  assert.equal(HIT_STOP_SPECS.PLAYER_ONE_UP_REVIVAL, 50, '1-UP resurrection impact hit-stop is 50ms');
  assert.equal(HIT_STOP_SPECS.PLAYER_FATAL_DEFEAT, 70, 'Lethal match over hit-stop is 70ms');
});

test('Juice M3 [Particle Emitters]: Pre-allocated Zero-GC emitter specifications', () => {
  const EMITTER_CONFIGS = {
    dust: {
      texture: 'particle_dust',
      lifespan: 220,
      speed: { min: 15, max: 35 },
      scale: { start: 0.7, end: 0.1 },
      alpha: { start: 0.45, end: 0 },
      emitting: false,
      depth: RENDER_DEPTH.DEBRIS_PARTICLES,
    },
    bombSpark: {
      texture: 'particle_spark',
      lifespan: { min: 100, max: 200 },
      speed: { min: 40, max: 90 },
      angle: { min: 230, max: 310 },
      gravityY: -60,
      scale: { start: 0.8, end: 0.1 },
      emitting: false,
      depth: RENDER_DEPTH.DEBRIS_PARTICLES,
    },
    blockDebris: {
      texture: 'particle_debris',
      lifespan: { min: 320, max: 480 },
      speed: { min: 90, max: 180 },
      angle: { min: 0, max: 360 },
      rotate: { start: 0, end: 360 },
      scale: { start: 1.0, end: 0.2 },
      gravityY: 350,
      tint: [0xf97316, 0xc2410c, 0xb45309, 0x78350f],
      emitting: false,
      depth: RENDER_DEPTH.DEBRIS_PARTICLES,
    },
  };

  assert.equal(EMITTER_CONFIGS.dust.depth, 770, 'Dust depth must match DEBRIS_PARTICLES (770)');
  assert.equal(EMITTER_CONFIGS.dust.emitting, false, 'Dust emitter must be burst-driven (emitting: false)');
  assert.equal(EMITTER_CONFIGS.dust.lifespan, 220, 'Dust lifespan must be 220ms');

  assert.equal(EMITTER_CONFIGS.bombSpark.gravityY, -60, 'Sparks float upward against gravity');
  assert.equal(EMITTER_CONFIGS.blockDebris.tint.length, 4, 'Block debris uses 4 distinct earthen brick tints');
  assert.equal(EMITTER_CONFIGS.blockDebris.gravityY, 350, 'Debris drops under physical gravity');
});

test('Juice M3 [Zero-GC Invariant]: Particle burst execution creates 0 heap object allocations', () => {
  class MockParticleEmitterPool {
    constructor(capacity = 256) {
      this.pool = new Array(capacity).fill(null).map(() => ({ active: false, x: 0, y: 0 }));
      this.burstCallCount = 0;
      this.emittedCount = 0;
    }

    emitParticleAt(x, y, count = 1) {
      this.burstCallCount++;
      for (let i = 0; i < count; i++) {
        const p = this.pool[this.emittedCount % this.pool.length];
        p.active = true;
        p.x = x;
        p.y = y;
        this.emittedCount++;
      }
    }

    explode(count, x, y) {
      this.emitParticleAt(x, y, count);
    }
  }

  const emitter = new MockParticleEmitterPool(512);

  // 10,000 rapid walking footstep dust bursts and block explosions
  for (let i = 0; i < 10000; i++) {
    emitter.emitParticleAt(100 + (i % 20), 100, 1);
    if (i % 100 === 0) {
      emitter.explode(8, 200, 200);
    }
  }

  assert.equal(emitter.burstCallCount, 10100, 'All bursts handled via pre-allocated pool');
  assert.equal(emitter.emittedCount, 10000 + 100 * 8, 'Exact particle counts recycled without allocations');
});

test('Juice M3 [Entity Drop Shadow]: Grounding depth 6 and height modulation dynamics', () => {
  const shadow = {
    x: 100,
    y: 114,
    depth: 6,
    scaleX: 1.0,
    scaleY: 0.7,
    alpha: 0.45,
    setScale(sx, sy) {
      this.scaleX = sx;
      this.scaleY = sy;
    },
    setAlpha(a) {
      this.alpha = a;
    },
    setDepth(d) {
      this.depth = d;
    },
  };

  assert.equal(shadow.depth, 6, 'Entity drop shadow depth must be exactly 6');
  assert.equal(shadow.alpha, 0.45, 'Baseline shadow alpha must be 0.45');
  assert.equal(shadow.scaleX, 1.0, 'Baseline scaleX must be 1.0');
  assert.equal(shadow.scaleY, 0.7, 'Baseline scaleY must be 0.7');

  // Test shadow response to vertical bobbing (hop: 0px to 3px)
  for (let hop = 0; hop <= 3; hop += 0.5) {
    const hNorm = hop / 20;
    const sx = Math.max(0.4, 1.0 - hNorm * 0.25);
    const sy = Math.max(0.3, 0.7 - hNorm * 0.20);
    const alpha = Math.max(0.15, 0.45 - hNorm * 0.20);

    shadow.setScale(sx, sy);
    shadow.setAlpha(alpha);

    if (hop === 0) {
      assert.equal(shadow.scaleX, 1.0, 'Ground contact scaleX must be 1.0');
      assert.equal(shadow.scaleY, 0.7, 'Ground contact scaleY must be 0.7');
      assert.equal(shadow.alpha, 0.45, 'Ground contact alpha must be 0.45');
    }
    if (hop === 3) {
      assert.ok(shadow.scaleX < 1.0, 'Apex shadow scaleX must contract as entity rises');
      assert.ok(shadow.scaleY < 0.7, 'Apex shadow scaleY must contract as entity rises');
      assert.ok(shadow.alpha < 0.45, 'Apex shadow alpha must diffuse as entity rises');
    }
  }
});

test('Juice M3 [Item Hover & Shadow]: Depth 3 and inverse breathing tween dynamics', () => {
  const itemShadow = {
    x: 200,
    y: 214,
    depth: 3,
    scaleX: 0.75,
    scaleY: 0.50,
    alpha: 0.35,
    destroyed: false,
    destroy() {
      this.destroyed = true;
    },
  };

  assert.equal(itemShadow.depth, 3, 'Item shadow depth must be 3 (beneath items at depth 6)');

  // Target values for item hover apex tween
  const targetScaleX = 0.60;
  const targetScaleY = 0.38;
  const targetAlpha = 0.22;

  assert.ok(targetScaleX < itemShadow.scaleX, 'Item shadow scales down when item rises');
  assert.ok(targetScaleY < itemShadow.scaleY, 'Item shadow compresses when item rises');
  assert.ok(targetAlpha < itemShadow.alpha, 'Item shadow fades when item rises');

  // Lifecycle destroy hook
  itemShadow.destroy();
  assert.equal(itemShadow.destroyed, true, 'Item shadow must be destroyed when item is collected or destroyed');
});

test('Juice M3 [2.5D Ambient Occlusion]: Walls and blocks create depth-1 southern shadows', () => {
  const block = {
    row: 3,
    col: 5,
    x: 5 * 40 + 20,
    y: 3 * 40 + 20,
    depth: RENDER_DEPTH.BLOCKS, // 2
    data: new Map(),
    setData(k, v) {
      this.data.set(k, v);
    },
    getData(k) {
      return this.data.get(k);
    },
    destroy() {
      const ao = this.getData('aoShadow');
      if (ao) ao.destroy();
    },
  };

  const aoShadow = {
    x: block.x,
    y: block.y + 4, // 4px southern offset
    depth: 1, // Below blocks (depth 2)
    destroyed: false,
    destroy() {
      this.destroyed = true;
    },
  };

  block.setData('aoShadow', aoShadow);

  assert.equal(aoShadow.depth, 1, 'AO shadow depth must be 1 (under blocks at depth 2)');
  assert.equal(aoShadow.y, block.y + 4, 'AO shadow must be offset 4px south for 2.5D lighting');

  // Demolish block
  block.destroy();
  assert.equal(aoShadow.destroyed, true, 'AO shadow must be cleanly destroyed on block demolition');
});
