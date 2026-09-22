/**
 * Challenger 2 for Milestone 2: Empirical Stress Test Suite
 *
 * Empirical adversarial stress tests on:
 * 1. Player Protection Bubble:
 *    - Opacity decay curve (R = 38px, <= 20px -> 0.0, 20..38px -> [0..0.15], > 38px -> 1.0)
 *    - 1,000 randomized entity approach vectors (radial angles, variable steps)
 *    - Frame-over-frame dynamic lerp transitions (smooth non-popping decay)
 *    - Label vs body distance discrepancy stress (protection against label occlusion)
 *    - Numerical singularities (co-located d=0, negative delta, large coords, null player)
 *
 * 2. Floating Text Cascade Queue:
 *    - 20+ pickups spam within 100ms (+16px vertical cascade, zero text overlap)
 *    - 100 extreme rapid spams within 100ms
 *    - Spatial clustering: independent cascades across distant clusters (> 30px)
 *    - Sliding window time expiry (450ms pruning, bounded queue size, zero memory leak)
 *    - Cooldown reset back to 0px offset after idle window
 *    - Execution performance & zero-GC verification
 *
 * 3. Continuous Depth Band Sorting Invariants:
 *    - RENDER_DEPTH global hierarchy and ground/entity/VFX/UI non-overlapping partitions
 *    - Intra-entity sub-layer separation (shadow < sprite < shield < hp < name < intent)
 *    - Continuous 2.5D natural occlusion across 1,000 randomized entity pairs
 *    - Vertical transit inversion without discontinuity
 *    - Player dynamic depth parity with entity layer
 */

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

// Minimal DOM & Canvas mocks for headless instantiation
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
  RENDER_DEPTH,
  OverheadUIManager,
  FloatingTextManager,
} = await import('../src/game/GameScene.ts');

const {
  OverheadUI,
} = await import('../src/game/entities/OverheadUI.ts');

/* ==============================================================================
 * MOCK ENTITY HELPER
 * ============================================================================== */

function createMockEntity(x, y, name = 'Chaser: Blinky', faction = 'enemy', maxHp = 3) {
  const overheadUI = new OverheadUI(null, name, faction, maxHp, 24);
  overheadUI.update(x, y, maxHp);

  let currentDepth = 0;
  return {
    x,
    y,
    active: true,
    isDead: false,
    overheadUI,
    setDepth(depth) {
      currentDepth = depth;
    },
    getDepth() {
      return currentDepth;
    },
  };
}

/* ==============================================================================
 * SUITE 1: PLAYER PROTECTION BUBBLE OPACITY DECAY (R = 38px)
 * ============================================================================== */

test('Challenger 2.1 [Player Bubble]: 1,000 randomized entity approach vectors verify exact opacity decay curve', () => {
  const manager = new OverheadUIManager();
  const player = { x: 300, y: 300 };

  // We test 1,000 distinct approach vectors at random angles theta in [0, 2pi)
  // sweeping distance from 100px down to 0px in steps of 2px
  const VECTORS = 1000;
  let checksCount = 0;

  for (let v = 0; v < VECTORS; v++) {
    const theta = Math.random() * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    for (let dist = 100; dist >= 0; dist -= 2) {
      checksCount++;
      // Position entity along approach vector
      const entityX = player.x + cosT * dist;
      const entityY = player.y + sinT * dist;
      const entity = createMockEntity(entityX, entityY, `VectorEntity_${v}`);

      // Evaluate immediate targetAlpha
      manager.update([entity], player, 16, true);

      const alpha = entity.overheadUI.currentAlpha;

      // Invariant 1: No NaN, finite, bounded in [0.0, 1.0]
      assert.ok(!Number.isNaN(alpha), `Alpha must not be NaN at dist=${dist}`);
      assert.ok(alpha >= 0.0 && alpha <= 1.0, `Alpha must be in [0, 1], got ${alpha}`);

      // Calculate expected targetAlpha according to specification:
      // lx = entity.x + ox, ly = entity.y - 22 + oy
      // distLabel = hypot(lx - px, ly - py)
      // distBody = hypot(ex - px, ey - py)
      // effectiveDist = min(distLabel, distBody)
      const lx = entityX;
      const ly = entityY - 22;
      const distLabel = Math.hypot(lx - player.x, ly - player.y);
      const distBody = Math.hypot(entityX - player.x, entityY - player.y);
      const effectiveDist = Math.min(distLabel, distBody);

      if (effectiveDist <= 20) {
        assert.equal(
          alpha,
          0.0,
          `At effectiveDist=${effectiveDist.toFixed(2)} <= 20, alpha must be strictly 0.0 (got ${alpha})`
        );
      } else if (effectiveDist <= 38) {
        const expectedAlpha = Math.min(0.15, 0.15 * ((effectiveDist - 20) / (38 - 20)));
        assert.ok(
          Math.abs(alpha - expectedAlpha) < 1e-5,
          `At effectiveDist=${effectiveDist.toFixed(2)}, alpha ${alpha} must match curve ${expectedAlpha}`
        );
        assert.ok(alpha > 0.0, `Alpha ${alpha} must be > 0.0 for dist > 20`);
        assert.ok(alpha <= 0.15, `Alpha ${alpha} must be <= 0.15 within bubble`);
      } else {
        assert.equal(
          alpha,
          1.0,
          `At effectiveDist=${effectiveDist.toFixed(2)} > 38, alpha must be strictly 1.0 (got ${alpha})`
        );
      }
    }
  }

  assert.ok(checksCount >= 50000, `Completed ${checksCount} empirical approach curve evaluations`);
});

test('Challenger 2.2 [Player Bubble]: Frame-over-frame dynamic lerp ensures smooth non-popping transitions across 100 approaches', () => {
  const manager = new OverheadUIManager();
  const player = { x: 300, y: 300 };
  const DELTA_60FPS = 16.666; // 60 FPS in ms

  for (let trajectory = 0; trajectory < 100; trajectory++) {
    const angle = (trajectory / 100) * Math.PI * 2;
    const entity = createMockEntity(player.x + Math.cos(angle) * 80, player.y + Math.sin(angle) * 80);

    // Initial state outside bubble
    manager.update([entity], player, DELTA_60FPS, true);
    assert.equal(entity.overheadUI.currentAlpha, 1.0);

    let prevAlpha = 1.0;

    // Entity moves inward from 80px to 5px over 75 frames (~1.25s)
    for (let frame = 1; frame <= 75; frame++) {
      const currentDist = 80 - (frame / 75) * 75; // from 80 down to 5
      entity.x = player.x + Math.cos(angle) * currentDist;
      entity.y = player.y + Math.sin(angle) * currentDist;

      // Update with immediate = false (lerp active)
      manager.update([entity], player, DELTA_60FPS, false);
      const currAlpha = entity.overheadUI.currentAlpha;

      // Maximum 1-frame change should be strictly bounded by lerp factor:
      // lerpFactor = min(1.0, 16.666 * 0.015) = 0.25
      const frameDelta = Math.abs(currAlpha - prevAlpha);
      assert.ok(
        frameDelta <= 0.26,
        `Frame ${frame}: Alpha step ${frameDelta.toFixed(4)} must not pop violently (lerp limit 0.25)`
      );

      // Must remain within valid range
      assert.ok(currAlpha >= 0.0 && currAlpha <= 1.0);
      prevAlpha = currAlpha;
    }

    // After remaining inside <= 20px for 60 additional frames, alpha must asymptotically reach 0
    for (let f = 0; f < 60; f++) {
      manager.update([entity], player, DELTA_60FPS, false);
    }
    assert.ok(
      entity.overheadUI.currentAlpha < 1e-4,
      `Alpha must settle to near 0.0 when staying inside <= 20px (got ${entity.overheadUI.currentAlpha})`
    );

    // Now retreat outward from 5px to 100px over 60 frames
    for (let frame = 1; frame <= 60; frame++) {
      const currentDist = 5 + (frame / 60) * 95;
      entity.x = player.x + Math.cos(angle) * currentDist;
      entity.y = player.y + Math.sin(angle) * currentDist;

      manager.update([entity], player, DELTA_60FPS, false);
      assert.ok(
        entity.overheadUI.currentAlpha <= 1.0,
        `Alpha must never overshoot 1.0 during recovery (got ${entity.overheadUI.currentAlpha})`
      );
    }

    // Settle outside for 60 frames
    for (let f = 0; f < 60; f++) {
      manager.update([entity], player, DELTA_60FPS, false);
    }
    assert.ok(
      entity.overheadUI.currentAlpha > 0.999,
      `Alpha must fully recover to 1.0 outside bubble (got ${entity.overheadUI.currentAlpha})`
    );
  }
});

test('Challenger 2.3 [Player Bubble]: Dual-distance check (distLabel vs distBody) guarantees player protection against overhead label occlusion', () => {
  const manager = new OverheadUIManager();
  const player = { x: 300, y: 300 };

  // Case A: Entity body is at y=322 (distBody = 22px > 20px), but label is at y=300 (distLabel = 0px <= 20px)
  // Label directly covers the player's sprite!
  const entityBelowPlayer = createMockEntity(300, 322, 'BelowPlayer');
  manager.update([entityBelowPlayer], player, 16, true);
  assert.equal(
    entityBelowPlayer.overheadUI.currentAlpha,
    0.0,
    'Label directly covering player must have alpha 0.0 even if entity body is at 22px'
  );

  // Case B: Entity body is at y=300 (distBody = 0px <= 20px), while label is at y=278 (distLabel = 22px)
  const entityOnPlayer = createMockEntity(300, 300, 'OnPlayer');
  manager.update([entityOnPlayer], player, 16, true);
  assert.equal(
    entityOnPlayer.overheadUI.currentAlpha,
    0.0,
    'Entity body overlapping player must force alpha 0.0 even if label is 22px away'
  );

  // Case C: Entity body at 50px (outside), label at 45px (outside > 38px)
  const entityFar = createMockEntity(350, 300, 'FarAway');
  manager.update([entityFar], player, 16, true);
  assert.equal(entityFar.overheadUI.currentAlpha, 1.0, 'Entity fully outside bubble retains 1.0');
});

test('Challenger 2.4 [Player Bubble]: Edge cases, boundary singularities & null-player robustness', () => {
  const manager = new OverheadUIManager();

  // Null player must not crash and entities retain 1.0
  const entity = createMockEntity(200, 200, 'Solo');
  assert.doesNotThrow(() => {
    manager.update([entity], null, 16, true);
  });
  assert.equal(entity.overheadUI.currentAlpha, 1.0);

  // Exact co-location (0/0 singularity in hypot)
  const playerCo = { x: 100, y: 100 };
  const entityCo = createMockEntity(100, 100, 'CoLocated');
  assert.doesNotThrow(() => {
    manager.update([entityCo], playerCo, 16, true);
  });
  assert.equal(entityCo.overheadUI.currentAlpha, 0.0);

  // Extreme delta values: delta = 0, delta = -100, delta = 1,000,000
  manager.update([entityCo], playerCo, 0, false);
  assert.ok(!Number.isNaN(entityCo.overheadUI.currentAlpha));

  manager.update([entityCo], playerCo, -100, false);
  assert.ok(!Number.isNaN(entityCo.overheadUI.currentAlpha));

  manager.update([entityCo], playerCo, 1000000, false);
  assert.ok(!Number.isNaN(entityCo.overheadUI.currentAlpha));
  assert.equal(entityCo.overheadUI.currentAlpha, 0.0);
});

/* ==============================================================================
 * SUITE 2: FLOATING TEXT CASCADE QUEUE UNDER RAPID SPAM
 * ============================================================================== */

test('Challenger 2.5 [Floating Text]: Rapid spam of 25 pickups within 100ms cascades by +16px with zero text overlap', () => {
  const ftManager = new FloatingTextManager();
  const startTime = 1000;
  const originX = 250;
  const originY = 300;
  const FONT_SIZE_PX = 12; // Specified 12px font size in GameScene.ts
  const PICKUP_COUNT = 25;

  const offsets = [];
  const startYPositions = [];

  // Fire 25 pickups in 96ms (4ms interval)
  for (let i = 0; i < PICKUP_COUNT; i++) {
    const time = startTime + i * 4;
    const offset = ftManager.getCascadeOffset(originX, originY, time);
    offsets.push(offset);

    // In GameScene.ts: startY = y - cascadeOffset
    const startY = originY - offset;
    startYPositions.push(startY);
  }

  // 1. Verify exact linear +16px progression
  for (let i = 0; i < PICKUP_COUNT; i++) {
    const expectedOffset = i * 16;
    assert.equal(
      offsets[i],
      expectedOffset,
      `Pickup #${i + 1} at t=${startTime + i * 4}ms must have offset ${expectedOffset}px (got ${offsets[i]})`
    );
  }

  // 2. Verify strict vertical separation and zero text overlap
  for (let i = 0; i < PICKUP_COUNT - 1; i++) {
    const upperY = startYPositions[i + 1]; // later pickup is higher (smaller Y)
    const lowerY = startYPositions[i];     // earlier pickup is lower (larger Y)
    const verticalGap = lowerY - upperY;

    assert.equal(
      verticalGap,
      16,
      `Vertical gap between text #${i} and #${i + 1} must be exactly 16px`
    );

    // With 12px font size, clear space between text baselines/bounding boxes is:
    const clearance = verticalGap - FONT_SIZE_PX;
    assert.ok(
      clearance >= 4,
      `Vertical text clearance ${clearance}px must be strictly positive (zero overlap)`
    );
  }
});

test('Challenger 2.6 [Floating Text]: Extreme rapid burst (100 simultaneous pickups at same ms) maintains strict +16px cascade', () => {
  const ftManager = new FloatingTextManager();
  const timestamp = 5000;
  const originX = 200;
  const originY = 200;
  const BURST_COUNT = 100;

  for (let i = 0; i < BURST_COUNT; i++) {
    const offset = ftManager.getCascadeOffset(originX, originY, timestamp);
    assert.equal(offset, i * 16, `Burst pickup ${i} at identical ms must cascade to ${i * 16}px`);
  }

  assert.equal(ftManager.getActiveCount(), BURST_COUNT);
});

test('Challenger 2.7 [Floating Text]: Spatial independence — distant clusters (> 30px) cascade independently without crosstalk', () => {
  const ftManager = new FloatingTextManager();
  const time = 2000;

  // Cluster 1 at (100, 100) — e.g., Player
  // Cluster 2 at (400, 400) — e.g., MiniBomber Ally (distance = 424px > 30px)
  // Cluster 3 at (125, 100) — distance = 25px <= 30px (same cluster)

  const c1_1 = ftManager.getCascadeOffset(100, 100, time);
  const c2_1 = ftManager.getCascadeOffset(400, 400, time);
  assert.equal(c1_1, 0, 'Cluster 1 first pickup offset = 0');
  assert.equal(c2_1, 0, 'Cluster 2 first pickup offset = 0 (independent of Cluster 1)');

  const c1_2 = ftManager.getCascadeOffset(100, 100, time + 20);
  assert.equal(c1_2, 16, 'Cluster 1 second pickup offset = 16');

  // Pickup near Cluster 1 (dist = 25px <= 30px)
  const c1_3 = ftManager.getCascadeOffset(125, 100, time + 40);
  assert.equal(c1_3, 32, 'Pickup at dist 25px participates in Cluster 1 cascade (+32px)');

  // Cluster 2 should still have seen only 1 pickup
  const c2_2 = ftManager.getCascadeOffset(400, 400, time + 60);
  assert.equal(c2_2, 16, 'Cluster 2 second pickup offset = 16 (no crosstalk from Cluster 1)');
});

test('Challenger 2.8 [Floating Text]: Sliding window pruning (450ms) prevents unbounded queue growth and resets offset after idle', () => {
  const ftManager = new FloatingTextManager();
  let currentTime = 10000;

  // 1. Simulate 500 continuous pickups spaced 20ms apart over 10 seconds
  for (let step = 0; step < 500; step++) {
    currentTime += 20;
    ftManager.getCascadeOffset(200, 200, currentTime);

    // At 20ms intervals, in 450ms there can be at most 450 / 20 + 1 = 23 or 24 active items
    const activeCount = ftManager.getActiveCount();
    assert.ok(
      activeCount <= 25,
      `Active text queue size ${activeCount} must remain bounded <= 25 (zero memory leak)`
    );
  }

  // 2. Idle for 451ms (cooldown window expiration)
  currentTime += 451;
  const resetOffset = ftManager.getCascadeOffset(200, 200, currentTime);
  assert.equal(resetOffset, 0, 'After 451ms idle, cascade offset must reset back to 0px');
  assert.equal(ftManager.getActiveCount(), 1, 'Only the new pickup remains in queue');

  // 3. Explicit reset() clears all entries
  ftManager.reset();
  assert.equal(ftManager.getActiveCount(), 0, 'reset() must leave active texts empty');
});

test('Challenger 2.9 [Floating Text]: 10,000 rapid calls benchmark completes in < 30ms with 0 NaN', () => {
  const ftManager = new FloatingTextManager();
  const start = performance.now();
  let time = 0;

  for (let i = 0; i < 10000; i++) {
    time += (i % 5 === 0) ? 50 : 2; // mix of bursts and advances
    const offset = ftManager.getCascadeOffset(150 + (i % 50), 200, time);
    assert.ok(!Number.isNaN(offset), 'Offset must never be NaN');
    assert.ok(offset >= 0, 'Offset must be non-negative');
  }

  const duration = performance.now() - start;
  assert.ok(duration < 30, `10,000 cascade calls must complete in < 30ms (took ${duration.toFixed(2)}ms)`);
});

/* ==============================================================================
 * SUITE 3: CONTINUOUS DEPTH BAND SORTING INVARIANTS
 * ============================================================================== */

test('Challenger 2.10 [Depth Invariants]: Global RENDER_DEPTH layers strictly partition ground, entities, VFX, and UI', () => {
  // Ground layers partition
  const groundLayers = [
    RENDER_DEPTH.BACKGROUND,
    RENDER_DEPTH.FLOOR,
    RENDER_DEPTH.WALLS,
    RENDER_DEPTH.BLOCKS,
    RENDER_DEPTH.DECALS,
    RENDER_DEPTH.PORTALS,
    RENDER_DEPTH.ITEM_GLOW,
    RENDER_DEPTH.ITEMS,
    RENDER_DEPTH.BOMBS,
    RENDER_DEPTH.TELEGRAPHS,
    RENDER_DEPTH.CRISIS_HAZARDS,
  ];

  for (let i = 0; i < groundLayers.length - 1; i++) {
    assert.ok(
      groundLayers[i] <= groundLayers[i + 1],
      `Ground layer ${i} (${groundLayers[i]}) must be <= layer ${i + 1} (${groundLayers[i + 1]})`
    );
  }

  const maxGround = Math.max(...groundLayers);
  assert.equal(maxGround, RENDER_DEPTH.CRISIS_HAZARDS); // 9

  // Entity dynamic band across screen Y in [0, 600]:
  // Minimum entity depth is at y = 0 with OFFSET_SHADOW (-0.1): 100 - 0.1 = 99.9
  // Maximum entity depth is at y = 600 with OFFSET_INTENT_BADGE (+0.4): 700 + 0.4 = 700.4
  const minEntityDepth = RENDER_DEPTH.ENTITY_Y_BASE + 0 * RENDER_DEPTH.ENTITY_Y_SCALE + RENDER_DEPTH.OFFSET_SHADOW;
  const maxEntityDepth = RENDER_DEPTH.ENTITY_Y_BASE + 600 * RENDER_DEPTH.ENTITY_Y_SCALE + RENDER_DEPTH.OFFSET_INTENT_BADGE;

  assert.ok(
    minEntityDepth > maxGround,
    `Minimum entity depth (${minEntityDepth}) must be strictly greater than max ground layer (${maxGround})`
  );

  // VFX layer partition
  assert.ok(
    RENDER_DEPTH.EXPLOSIONS > maxEntityDepth,
    `EXPLOSIONS (${RENDER_DEPTH.EXPLOSIONS}) must be strictly above max entity depth (${maxEntityDepth})`
  );
  assert.ok(RENDER_DEPTH.EXPLOSIONS < RENDER_DEPTH.SHOCKWAVES);
  assert.ok(RENDER_DEPTH.SHOCKWAVES < RENDER_DEPTH.DEBRIS_PARTICLES);
  assert.ok(RENDER_DEPTH.DEBRIS_PARTICLES < RENDER_DEPTH.BOSS_BODY);
  assert.ok(RENDER_DEPTH.BOSS_BODY < RENDER_DEPTH.BOSS_VFX);
  assert.ok(RENDER_DEPTH.BOSS_VFX < RENDER_DEPTH.FLOATING_TEXT);
  assert.ok(RENDER_DEPTH.FLOATING_TEXT < RENDER_DEPTH.SCREEN_OVERLAY);
});

test('Challenger 2.11 [Depth Invariants]: Intra-entity sub-layer separation invariant is strictly preserved at all coordinates', () => {
  const manager = new OverheadUIManager();
  const testYCoords = [-100, 0, 15.5, 120, 240.75, 450, 600, 1000];

  for (const y of testYCoords) {
    const entity = createMockEntity(200, y, 'IntraTest');
    manager.update([entity], { x: 500, y: 500 }, 16, true);

    const baseDepth = RENDER_DEPTH.ENTITY_Y_BASE + y * RENDER_DEPTH.ENTITY_Y_SCALE;
    const shadowDepth = baseDepth + RENDER_DEPTH.OFFSET_SHADOW;
    const spriteDepth = entity.getDepth();
    const hpDepth = entity.overheadUI.hpGraphics ? entity.overheadUI.hpGraphics.depth : baseDepth + RENDER_DEPTH.OFFSET_HP_BAR;
    const nameDepth = entity.overheadUI.nameTag ? entity.overheadUI.nameTag.depth : baseDepth + RENDER_DEPTH.OFFSET_NAME_TAG;
    const intentDepth = entity.overheadUI.indicator ? entity.overheadUI.indicator.depth : baseDepth + RENDER_DEPTH.OFFSET_INTENT_BADGE;

    assert.equal(spriteDepth, baseDepth + RENDER_DEPTH.OFFSET_SPRITE);
    assert.ok(shadowDepth < spriteDepth, `Shadow < Sprite at y=${y}`);
    assert.ok(spriteDepth < hpDepth, `Sprite < HP Bar at y=${y}`);
    assert.ok(hpDepth < nameDepth, `HP Bar < Name Tag at y=${y}`);
    assert.ok(nameDepth < intentDepth, `Name Tag < Intent Badge at y=${y}`);

    // Verify sub-offset spacing is exactly 0.1
    assert.ok(Math.abs((spriteDepth - shadowDepth) - 0.1) < 1e-6);
    assert.ok(Math.abs((hpDepth - spriteDepth) - 0.2) < 1e-6);
    assert.ok(Math.abs((nameDepth - hpDepth) - 0.1) < 1e-6);
    assert.ok(Math.abs((intentDepth - nameDepth) - 0.1) < 1e-6);
  }
});

test('Challenger 2.12 [Depth Invariants]: 1,000 randomized entity pairs satisfy 2.5D natural occlusion and depth monotonicity', () => {
  const manager = new OverheadUIManager();
  const PAIRS = 1000;

  for (let p = 0; p < PAIRS; p++) {
    const yA = Math.random() * 580 + 10;
    const yB = Math.random() * 580 + 10;
    const xA = Math.random() * 500 + 50;
    const xB = Math.random() * 500 + 50;

    const eA = createMockEntity(xA, yA, `EntityA_${p}`);
    const eB = createMockEntity(xB, yB, `EntityB_${p}`);

    manager.update([eA, eB], { x: 0, y: 0 }, 16, true);

    const baseA = RENDER_DEPTH.ENTITY_Y_BASE + yA * RENDER_DEPTH.ENTITY_Y_SCALE;
    const baseB = RENDER_DEPTH.ENTITY_Y_BASE + yB * RENDER_DEPTH.ENTITY_Y_SCALE;

    assert.equal(eA.getDepth(), baseA + RENDER_DEPTH.OFFSET_SPRITE);
    assert.equal(eB.getDepth(), baseB + RENDER_DEPTH.OFFSET_SPRITE);

    if (yA < yB) {
      assert.ok(eA.getDepth() < eB.getDepth(), `Entity at y=${yA} must have lower depth than entity at y=${yB}`);

      // If yB is at least 1px south of yA, southern entity's sprite naturally renders in front of northern intent badge
      if (yB - yA > 0.5) {
        const intentDepthA = baseA + RENDER_DEPTH.OFFSET_INTENT_BADGE;
        const spriteDepthB = eB.getDepth();
        assert.ok(
          spriteDepthB > intentDepthA,
          `Southern sprite at y=${yB} (depth ${spriteDepthB}) must occlude Northern label at y=${yA} (depth ${intentDepthA})`
        );
      }
    } else if (yA > yB) {
      assert.ok(eA.getDepth() > eB.getDepth(), `Entity at y=${yA} must have higher depth than entity at y=${yB}`);
    } else {
      assert.equal(eA.getDepth(), eB.getDepth(), 'Identical Y must produce identical depth');
    }
  }
});

test('Challenger 2.13 [Depth Invariants]: Vertical crossing transit inverts depth order continuously with 0 hitch', () => {
  const manager = new OverheadUIManager();
  const stationary = createMockEntity(200, 200, 'Stationary');
  const mover = createMockEntity(200, 100, 'Mover');

  // Mover walks south from y = 100 to y = 300 in 100 steps
  for (let step = 0; step <= 100; step++) {
    mover.y = 100 + step * 2; // 100, 102, ..., 198, 200, 202, ..., 300
    manager.update([stationary, mover], { x: 500, y: 500 }, 16, true);

    if (mover.y < stationary.y) {
      assert.ok(mover.getDepth() < stationary.getDepth(), `Step ${step}: Mover at ${mover.y} must be behind Stationary at 200`);
    } else if (mover.y > stationary.y) {
      assert.ok(mover.getDepth() > stationary.getDepth(), `Step ${step}: Mover at ${mover.y} must be in front of Stationary at 200`);
    } else {
      assert.equal(mover.getDepth(), stationary.getDepth(), `Step ${step}: Exact crossing point must have equal depth`);
    }
  }
});
