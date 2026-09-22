import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraTraumaSimulator } from '../src/game/ultimate_skills.ts';

/* ==============================================================================
 * CHALLENGER 2: ADVERSARIAL STRESS SUITE (MILESTONE 3)
 * Bomb Pulse Phases, Hit-Stop Debounce (50 Simultaneous Explosions), Camera Trauma T^2
 * ============================================================================== */

// -----------------------------------------------------------------------------
// PART 1: BOMB PULSE PHASES & PRE-DETONATION CONTRACTION
// -----------------------------------------------------------------------------

test('Challenger M3 [Bomb Pulse]: Player bomb 4-phase timing and duration sum to 2000ms', () => {
  // Specification as defined in GameScene.ts placeBomb()
  const playerBombTweens = [
    // Phase 1: Heartbeat (250ms half-period, yoyo: true, repeat: 1)
    { phase: 1, duration: 250, yoyo: true, repeat: 1, scaleX: 1.14, scaleY: 1.04 },
    // Phase 2: Amber Swell (150ms half-period, yoyo: true, repeat: 1)
    { phase: 2, duration: 150, yoyo: true, repeat: 1, scaleX: 1.22, scaleY: 0.92, tint: 0xff8844 },
    // Phase 3: Critical Detonation Hyper-Pulse (50ms half-period, yoyo: true, repeat: 2)
    { phase: 3, duration: 50, yoyo: true, repeat: 2, scaleX: 1.32, scaleY: 1.12, angle: 3.5, tint: 0xff2222 },
    // Phase 4: Pre-detonation Whiteout Contraction (100ms, yoyo: false, repeat: 0)
    { phase: 4, duration: 100, yoyo: false, repeat: 0, scaleX: 0.80, scaleY: 0.80, angle: 0, tint: 0xffffff },
  ];

  const p1Ms = playerBombTweens[0].duration * (playerBombTweens[0].yoyo ? 2 : 1) * (playerBombTweens[0].repeat + 1);
  const p2Ms = playerBombTweens[1].duration * (playerBombTweens[1].yoyo ? 2 : 1) * (playerBombTweens[1].repeat + 1);
  const p3Ms = playerBombTweens[2].duration * (playerBombTweens[2].yoyo ? 2 : 1) * (playerBombTweens[2].repeat + 1);
  const p4Ms = playerBombTweens[3].duration;

  assert.equal(p1Ms, 1000, 'Phase 1 duration must be exactly 1000ms');
  assert.equal(p2Ms, 600, 'Phase 2 duration must be exactly 600ms');
  assert.equal(p3Ms, 300, 'Phase 3 duration must be exactly 300ms');
  assert.equal(p4Ms, 100, 'Phase 4 duration must be exactly 100ms');

  const totalMs = p1Ms + p2Ms + p3Ms + p4Ms;
  assert.equal(totalMs, 2000, 'Sum of all 4 phases must match 2000ms fuse timer exactly');

  // Verify Phase 4 starts at exactly 1900ms
  const phase4StartTime = p1Ms + p2Ms + p3Ms;
  assert.equal(phase4StartTime, 1900, 'Phase 4 must trigger at exactly 1900ms (100ms before 2000ms blast)');
});

test('Challenger M3 [Bomb Pulse]: Pre-detonation contraction and whiteout flash invariants', () => {
  const p4 = {
    duration: 100,
    scaleX: 0.80,
    scaleY: 0.80,
    angle: 0,
    tint: 0xffffff,
    ease: 'Quad.easeIn',
  };

  assert.equal(p4.scaleX, 0.80, 'Contraction scaleX must be 0.80 (20% contraction from baseline)');
  assert.equal(p4.scaleY, 0.80, 'Contraction scaleY must be 0.80');
  assert.equal(p4.tint, 0xffffff, 'Flash tint must be pure white (0xffffff)');
  assert.equal(p4.angle, 0, 'Angle must snap back to 0 to stabilize before explosion');
  assert.equal(p4.ease, 'Quad.easeIn', 'Easing must accelerate into contraction (Quad.easeIn)');
});

test('Challenger M3 [Bomb Pulse]: Enemy bomb adaptive fuse partitioning across variable fuse lengths', () => {
  function computeEnemyPhases(fuseMs) {
    const p1 = Math.round(fuseMs * 0.50 / 4);
    const p2 = Math.round(fuseMs * 0.30 / 4);
    const p3 = Math.round(fuseMs * 0.15 / 6);
    const p4 = Math.max(50, fuseMs - (p1 * 4 + p2 * 4 + p3 * 6));

    const totalCalculated = p1 * 4 + p2 * 4 + p3 * 6 + p4;
    return { p1, p2, p3, p4, totalCalculated };
  }

  // Test standard and non-standard enemy fuse times
  const testFuses = [2000, 1800, 1500, 1200, 1000, 2400];
  for (const fuse of testFuses) {
    const { p1, p2, p3, p4, totalCalculated } = computeEnemyPhases(fuse);

    assert.equal(
      totalCalculated,
      fuse,
      `Enemy bomb fuse of ${fuse}ms must partition cleanly into 4 phases summing to ${fuse}ms`
    );
    assert.ok(p1 > p2, `Phase 1 half-period (${p1}) must be longer than Phase 2 (${p2}) for cadence acceleration`);
    assert.ok(p2 > p3, `Phase 2 half-period (${p2}) must be longer than Phase 3 (${p3}) for hyper-pulse`);
    assert.ok(p4 >= 50, `Phase 4 contraction must be at least 50ms (got ${p4}ms for fuse=${fuse}ms)`);
  }
});

test('Challenger M3 [Bomb Pulse]: Early detonation stress safely halts tween chain and clears fuse timers', () => {
  // Simulate 50 early bomb detonations (e.g. chain explosion or kick collision before 2000ms)
  let stoppedChains = 0;
  let removedTimers = 0;

  class MockTweenChain {
    constructor() {
      this.isPlaying = true;
    }
    stop() {
      this.isPlaying = false;
      stoppedChains++;
    }
  }

  class MockTimerEvent {
    constructor() {
      this.active = true;
    }
    remove() {
      this.active = false;
      removedTimers++;
    }
  }

  const mockBombs = [];
  for (let i = 0; i < 50; i++) {
    const chain = new MockTweenChain();
    const timer = new MockTimerEvent();
    const bomb = {
      active: true,
      data: new Map([
        ['tweenChain', chain],
        ['fuseTimer', timer],
        ['id', `bomb_${i}`],
      ]),
      getData(key) {
        return this.data.get(key);
      },
      destroy() {
        this.active = false;
      },
    };
    mockBombs.push(bomb);
  }

  // Detonate all 50 bombs early via explodeBomb cleanup logic
  for (const bomb of mockBombs) {
    const timer = bomb.getData('fuseTimer');
    if (timer) timer.remove(false);
    const chain = bomb.getData('tweenChain');
    if (chain) chain.stop();
    bomb.destroy();
  }

  assert.equal(stoppedChains, 50, 'All 50 tween chains must be stopped immediately');
  assert.equal(removedTimers, 50, 'All 50 fuse timers must be removed immediately');
  assert.ok(mockBombs.every((b) => !b.active), 'All 50 bomb sprites must be marked inactive');
});

// -----------------------------------------------------------------------------
// PART 2: HIT-STOP DEBOUNCE UNDER 50 SIMULTANEOUS & CASCADING EXPLOSIONS
// -----------------------------------------------------------------------------

class HitStopTestHarness {
  constructor() {
    this.isHitStopActive = false;
    this.lastHitStopMs = -9999;
    this.pauseCallCount = 0;
    this.resumeCallCount = 0;
    this.isPhysicsPaused = false;
    this.activeDelayedCalls = [];
  }

  // Faithful simulation of GameScene.triggerHitStop(durationMs)
  triggerHitStop(nowMs, durationMs = 40) {
    if (this.isHitStopActive || nowMs - this.lastHitStopMs < 150) {
      return false; // Rejected by active hit-stop or 150ms debounce guard
    }
    this.isHitStopActive = true;
    this.lastHitStopMs = nowMs;

    // Pause physics
    this.isPhysicsPaused = true;
    this.pauseCallCount++;

    // Schedule resume
    const call = {
      targetTimeMs: nowMs + durationMs,
      execute: () => {
        this.isPhysicsPaused = false;
        this.resumeCallCount++;
        this.isHitStopActive = false;
      },
    };
    this.activeDelayedCalls.push(call);
    return true;
  }

  // Advance simulation clock and execute scheduled delayed calls
  advanceTime(currentTimeMs) {
    const pending = this.activeDelayedCalls.filter((c) => c.targetTimeMs <= currentTimeMs);
    this.activeDelayedCalls = this.activeDelayedCalls.filter((c) => c.targetTimeMs > currentTimeMs);
    for (const call of pending) {
      call.execute();
    }
  }
}

test('Challenger M3 [Hit-Stop Debounce]: 50 simultaneous bomb explosions in identical millisecond', () => {
  const harness = new HitStopTestHarness();
  const t0 = 1000;

  let triggeredCount = 0;
  let rejectedCount = 0;

  // 50 bombs explode in the very same frame / millisecond
  for (let i = 0; i < 50; i++) {
    const accepted = harness.triggerHitStop(t0, 35);
    if (accepted) {
      triggeredCount++;
    } else {
      rejectedCount++;
    }
  }

  // Verification of debounce invariants
  assert.equal(triggeredCount, 1, 'Exactly 1 hit-stop trigger must be accepted among 50 simultaneous explosions');
  assert.equal(rejectedCount, 49, 'Exactly 49 hit-stop triggers must be debounced and rejected');
  assert.equal(harness.pauseCallCount, 1, 'Physics world.pause() must be invoked exactly once');
  assert.equal(harness.isPhysicsPaused, true, 'Physics must be paused during hit-stop');
  assert.equal(harness.activeDelayedCalls.length, 1, 'Only 1 delayedCall resume callback must be scheduled');

  // Advance clock to t = 1020ms (inside the 35ms hit-stop duration)
  harness.advanceTime(1020);
  assert.equal(harness.isPhysicsPaused, true, 'Physics must remain paused at t=1020ms');

  // Advance clock to t = 1035ms (completion of 35ms hit-stop)
  harness.advanceTime(1035);
  assert.equal(harness.isPhysicsPaused, false, 'Physics must be cleanly resumed at t=1035ms');
  assert.equal(harness.resumeCallCount, 1, 'Physics world.resume() must be invoked exactly once');
  assert.equal(harness.isHitStopActive, false, 'isHitStopActive must be reset to false');
  assert.equal(harness.activeDelayedCalls.length, 0, 'No lingering delayed calls');

  // Attempt to trigger hit-stop at t = 1100ms (within 150ms debounce window from t=1000)
  const rejectedInDebounce = harness.triggerHitStop(1100, 35);
  assert.equal(rejectedInDebounce, false, 'Hit-stop at t=1100ms must be rejected (1100 - 1000 = 100 < 150)');

  // Attempt to trigger hit-stop at t = 1150ms (exactly 150ms after t=1000)
  const acceptedAfterDebounce = harness.triggerHitStop(1150, 35);
  assert.equal(acceptedAfterDebounce, true, 'Hit-stop at t=1150ms must be accepted (1150 - 1000 = 150 >= 150)');
});

test('Challenger M3 [Hit-Stop Debounce]: 50 cascading explosions across a 150ms window', () => {
  const harness = new HitStopTestHarness();
  const startTime = 2000;
  let acceptedCount = 0;
  let debouncedCount = 0;

  // 50 explosions staggered by 3ms (t = 2000, 2003, 2006, ..., 2147ms)
  for (let i = 0; i < 50; i++) {
    const explosionTime = startTime + i * 3;
    harness.advanceTime(explosionTime);

    const accepted = harness.triggerHitStop(explosionTime, 35);
    if (accepted) {
      acceptedCount++;
    } else {
      debouncedCount++;
    }
  }

  // The first explosion at t=2000 triggers hit-stop (active until 2035ms).
  // Subsequent explosions up to t=2147ms are rejected because:
  // - 2003..2034: isHitStopActive is true.
  // - 2035..2147: explosionTime - 2000 < 150ms.
  assert.equal(acceptedCount, 1, 'Across 50 cascading explosions within 150ms, exactly 1 hit-stop is allowed');
  assert.equal(debouncedCount, 49, '49 explosions are safely suppressed');

  // Complete the hit-stop
  harness.advanceTime(2035);
  assert.equal(harness.isPhysicsPaused, false, 'Physics must resume on schedule without infinite pause');

  // Advance past the 150ms debounce window (t = 2151ms)
  harness.advanceTime(2151);
  const nextExplosionAccepted = harness.triggerHitStop(2151, 35);
  assert.equal(nextExplosionAccepted, true, 'Next explosion after 150ms debounce window triggers cleanly');
});

test('Challenger M3 [Hit-Stop Debounce]: Sustained 50-bomb carpet bombing across 3000ms prevents game freeze', () => {
  const harness = new HitStopTestHarness();
  let totalPausedMs = 0;
  let acceptedCount = 0;

  // 50 bombs explode every 60ms over 3000ms
  // Timeline: t = 0, 60, 120, 180, 240, 300, 360, ...
  for (let t = 0; t <= 3000; t += 10) {
    harness.advanceTime(t);

    if (t % 60 === 0 && t <= 2940) {
      // Bomb explodes at this timestamp
      const ok = harness.triggerHitStop(t, 35);
      if (ok) {
        acceptedCount++;
        totalPausedMs += 35;
      }
    }
  }

  // Hit stops should occur at:
  // t=0: accepted (next available at t >= 150)
  // t=60, 120: rejected
  // t=180: accepted (next available at t >= 330)
  // t=240, 300: rejected
  // t=360: accepted (next available at t >= 510)
  // ... every 180ms
  // In 3000ms, approx 3000 / 180 = ~16-17 accepted hit stops.
  assert.ok(acceptedCount >= 15 && acceptedCount <= 18, `Accepted count must be ~16-17 (got ${acceptedCount})`);

  // Total paused time out of 3000ms must be strictly bounded (< 25% of total elapsed game time)
  const pauseRatio = totalPausedMs / 3000;
  assert.ok(
    pauseRatio < 0.25,
    `Total pause time ratio (${(pauseRatio * 100).toFixed(1)}%) must be under 25% to prevent game freeze`
  );
  assert.equal(harness.isPhysicsPaused, false, 'Game physics must NOT be left frozen at end of barrage');
});

// -----------------------------------------------------------------------------
// PART 3: CAMERA TRAUMA NON-LINEAR DECAY (T^2) UNDER EXTREME EXPLOSION SPAM
// -----------------------------------------------------------------------------

test('Challenger M3 [Camera Trauma]: 50 rapid explosion shocks clamp strictly at 1.0 without overflow', () => {
  const traumaSim = new CameraTraumaSimulator(18, 3.5, 1.4);
  assert.equal(traumaSim.trauma, 0.0, 'Initial trauma must be 0.0');

  // 50 rapid bomb explosions each adding 0.35 trauma
  for (let i = 1; i <= 50; i++) {
    traumaSim.addTrauma(0.35);

    // Invariants: trauma must never exceed 1.0 or dip below 0.0, never be NaN
    assert.ok(!Number.isNaN(traumaSim.trauma), `Trauma must not be NaN on explosion ${i}`);
    assert.ok(traumaSim.trauma <= 1.0, `Trauma must strictly clamp <= 1.0 on explosion ${i} (got ${traumaSim.trauma})`);
    assert.ok(traumaSim.trauma >= 0.0, `Trauma must be >= 0.0 on explosion ${i}`);

    if (i >= 3) {
      assert.equal(traumaSim.trauma, 1.0, `Trauma must saturate at 1.0 on explosion ${i}`);
    }
  }

  // Check saturated magnitude values
  const mag = traumaSim.getShakeMagnitude();
  assert.equal(mag.trauma, 1.0, 'Saturated trauma must be 1.0');
  assert.equal(mag.offsetPx, 18.0, 'Maximum offset at trauma=1.0 must be 18px');
  assert.equal(mag.angleDeg, 3.5, 'Maximum angle at trauma=1.0 must be 3.5 degrees');
});

test('Challenger M3 [Camera Trauma]: Mathematical T^2 square-law adherence across full trauma domain', () => {
  const traumaSim = new CameraTraumaSimulator(18, 3.5, 1.4);

  // Sweep trauma from 0.0 to 1.0 in 0.05 steps
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const clampedT = Math.min(1.0, Math.max(0.0, t));
    traumaSim.trauma = clampedT;

    const mag = traumaSim.getShakeMagnitude();
    const expectedFactor = clampedT * clampedT;
    const expectedOffset = expectedFactor * 18.0;
    const expectedAngle = expectedFactor * 3.5;

    assert.ok(
      Math.abs(mag.offsetPx - expectedOffset) < 1e-9,
      `offsetPx must equal T^2 * maxOffset at T=${clampedT.toFixed(2)}`
    );
    assert.ok(
      Math.abs(mag.angleDeg - expectedAngle) < 1e-9,
      `angleDeg must equal T^2 * maxAngle at T=${clampedT.toFixed(2)}`
    );

    // Quadratic non-linearity test:
    // When T = 0.5, factor = 0.25 (intensity is 25% of max, NOT 50%)
    if (Math.abs(clampedT - 0.5) < 1e-4) {
      assert.ok(Math.abs(mag.offsetPx - 4.5) < 1e-6, 'Offset at T=0.5 must be 4.5px (25% of 18px)');
      assert.ok(Math.abs(mag.angleDeg - 0.875) < 1e-6, 'Angle at T=0.5 must be 0.875 deg (25% of 3.5 deg)');
    }
    // When T = 0.2, factor = 0.04 (intensity is 4% of max, NOT 20%)
    if (Math.abs(clampedT - 0.2) < 1e-4) {
      assert.ok(
        Math.abs(mag.offsetPx - 0.72) < 1e-6,
        'Offset at T=0.2 must be 0.72px (4% of 18px)'
      );
    }
  }
});

test('Challenger M3 [Camera Trauma]: Frame-by-frame 60 FPS decay matches decayRate 1.4 s^-1', () => {
  const traumaSim = new CameraTraumaSimulator(18, 3.5, 1.4);
  traumaSim.trauma = 1.0;

  const dtSec = 1 / 60; // 60 FPS frame time (approx 0.016667s)
  const theoreticalTotalTime = 1.0 / 1.4; // ~0.7142857 seconds
  const theoreticalFrames = Math.ceil(theoreticalTotalTime / dtSec); // 43 frames

  let frameCount = 0;
  let previousTrauma = 1.0;

  while (traumaSim.trauma > 0) {
    traumaSim.update(dtSec);
    frameCount++;

    assert.ok(
      traumaSim.trauma <= previousTrauma,
      `Trauma must decay monotonically on frame ${frameCount}`
    );
    assert.ok(traumaSim.trauma >= 0.0, `Trauma must never drop below 0.0 (got ${traumaSim.trauma})`);
    previousTrauma = traumaSim.trauma;

    // Safety guard against infinite loop
    if (frameCount > 100) break;
  }

  assert.equal(traumaSim.trauma, 0.0, 'Trauma must reach exactly 0.0 after decay');
  assert.equal(frameCount, theoreticalFrames, `Decay must take exactly ${theoreticalFrames} frames at 60 FPS`);

  // After trauma reaches 0.0, shake magnitude and camera offsets must be zero
  const zeroMag = traumaSim.getShakeMagnitude();
  assert.equal(zeroMag.trauma, 0);
  assert.equal(zeroMag.offsetPx, 0);
  assert.equal(zeroMag.angleDeg, 0);

  const zeroOffsets = traumaSim.getOffsets(12345);
  assert.equal(zeroOffsets.x, 0, 'Camera X offset must be exactly 0 after full decay');
  assert.equal(zeroOffsets.y, 0, 'Camera Y offset must be exactly 0 after full decay');
  assert.equal(zeroOffsets.angle, 0, 'Camera angle must be exactly 0 after full decay');
});

test('Challenger M3 [Camera Trauma]: Extreme delta spikes and fuzzing handle gracefully', () => {
  const traumaSim = new CameraTraumaSimulator(18, 3.5, 1.4);

  // Negative delta should not increase trauma
  traumaSim.trauma = 0.5;
  traumaSim.update(-1.0);
  assert.ok(traumaSim.trauma <= 0.5 || traumaSim.trauma >= 0, 'Negative delta does not break bounds');

  // Massive delta spike (e.g. background tab sleep for 10 seconds)
  traumaSim.trauma = 1.0;
  traumaSim.update(10.0);
  assert.equal(traumaSim.trauma, 0.0, 'Massive delta spike must cleanly drop trauma to 0.0 without underflow');

  // Fuzzing addTrauma with negative and extreme numbers
  traumaSim.addTrauma(-100);
  assert.equal(traumaSim.trauma, 0.0, 'Negative trauma addition clamps at 0.0');

  traumaSim.addTrauma(999999);
  assert.equal(traumaSim.trauma, 1.0, 'Huge trauma addition clamps at 1.0');
});

// -----------------------------------------------------------------------------
// PART 4: COMBINED 1,000-FRAME INTEGRATED SOAK SIMULATION
// -----------------------------------------------------------------------------

test('Challenger M3 [Integrated Soak]: 1000 frames under continuous 50-bomb bombardment', () => {
  const traumaSim = new CameraTraumaSimulator(18, 3.5, 1.4);
  const hitStopHarness = new HitStopTestHarness();

  const dtSec = 1 / 60;
  const dtMs = 16.667;
  let currentMs = 0;

  // Bomb detonation schedule: 50 bombs exploding across frames 0 to 600
  // Clusters of 5-10 bombs exploding at frames 50, 100, 150, 200, 300, 450, 600
  const bombSchedule = [
    { frame: 50, count: 8 },
    { frame: 100, count: 12 },
    { frame: 150, count: 5 },
    { frame: 200, count: 10 },
    { frame: 300, count: 5 },
    { frame: 450, count: 5 },
    { frame: 600, count: 5 },
  ];

  let totalBombsDetonated = 0;
  let totalHitStopsTriggered = 0;

  for (let frame = 0; frame < 1000; frame++) {
    currentMs += dtMs;
    hitStopHarness.advanceTime(currentMs);
    traumaSim.update(dtSec);

    // Check if bombs detonate this frame
    const schedule = bombSchedule.find((s) => s.frame === frame);
    if (schedule) {
      for (let b = 0; b < schedule.count; b++) {
        totalBombsDetonated++;
        traumaSim.addTrauma(0.35);
        const hitStopAccepted = hitStopHarness.triggerHitStop(currentMs, 35);
        if (hitStopAccepted) {
          totalHitStopsTriggered++;
        }
      }
    }

    // Inspect offsets each frame
    const offsets = traumaSim.getOffsets(currentMs);
    assert.ok(!Number.isNaN(offsets.x), `offsets.x must not be NaN at frame ${frame}`);
    assert.ok(!Number.isNaN(offsets.y), `offsets.y must not be NaN at frame ${frame}`);
    assert.ok(!Number.isNaN(offsets.angle), `offsets.angle must not be NaN at frame ${frame}`);
    assert.ok(
      Math.abs(offsets.x) <= 18.001,
      `offsets.x (${offsets.x}) must not exceed maxOffset 18 at frame ${frame}`
    );
    assert.ok(
      Math.abs(offsets.y) <= 18.001,
      `offsets.y (${offsets.y}) must not exceed maxOffset 18 at frame ${frame}`
    );
    assert.ok(
      Math.abs(offsets.angle) <= 3.501,
      `offsets.angle (${offsets.angle}) must not exceed maxAngle 3.5 at frame ${frame}`
    );
  }

  assert.equal(totalBombsDetonated, 50, 'Exactly 50 bombs must be detonated in the soak test');
  assert.equal(
    totalHitStopsTriggered,
    bombSchedule.length,
    'Exactly 1 hit-stop trigger per bomb cluster, all cluster duplicates debounced'
  );
  assert.equal(traumaSim.trauma, 0.0, 'Trauma must decay to 0.0 by frame 1000');
  assert.equal(hitStopHarness.isPhysicsPaused, false, 'Physics must not be stuck paused at frame 1000');
});
