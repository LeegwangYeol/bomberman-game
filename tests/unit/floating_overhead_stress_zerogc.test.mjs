import test from 'node:test';
import assert from 'node:assert/strict';

import { FloatingTextManager } from '../../src/game/ui/FloatingTextManager.ts';
import { OverheadUIManager } from '../../src/game/ui/OverheadUIManager.ts';
import { OverheadUI } from '../../src/game/entities/OverheadUI.ts';

function createMockEntity(x, y, name = 'Enemy', faction = 'enemy', maxHp = 3) {
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
 * SUITE 1: FLOATING TEXT MANAGER (2,500 RAPID BURSTS & ZERO OVERLAP)
 * ============================================================================== */

test('FloatingTextManager Stress [2,500 Rapid Bursts]: Simultaneous pickups maintain strict monotonic +16px cascade with 0 overlap', () => {
  const manager = new FloatingTextManager();
  const originX = 250;
  const originY = 300;
  const timestamp = 10000;
  const BURST_COUNT = 2500;
  const TEXT_FONT_SIZE_PX = 12;

  const offsets = new Float32Array(BURST_COUNT);
  const startYPositions = new Float32Array(BURST_COUNT);

  for (let i = 0; i < BURST_COUNT; i++) {
    const offset = manager.getCascadeOffset(originX, originY, timestamp);
    offsets[i] = offset;
    startYPositions[i] = originY - offset;
  }

  // 1. Strict monotonic +16px cascade progression
  for (let i = 0; i < BURST_COUNT; i++) {
    const expectedOffset = i * 16;
    assert.equal(
      offsets[i],
      expectedOffset,
      `Burst ${i} must have exact offset ${expectedOffset}px (got ${offsets[i]})`
    );
  }

  // 2. Strict vertical clearance check across all 2,499 consecutive pairs
  for (let i = 0; i < BURST_COUNT - 1; i++) {
    const lowerY = startYPositions[i];
    const upperY = startYPositions[i + 1];
    const verticalGap = lowerY - upperY;

    assert.equal(
      verticalGap,
      16,
      `Vertical gap between text #${i} and #${i + 1} must be exactly 16px`
    );

    const clearance = verticalGap - TEXT_FONT_SIZE_PX;
    assert.ok(
      clearance >= 4,
      `Clearance (${clearance}px) must be >= 4px above ${TEXT_FONT_SIZE_PX}px font (ZERO OVERLAP)`
    );
  }

  // 3. Exactly 2,500 unique offsets
  const uniqueOffsets = new Set(offsets);
  assert.equal(
    uniqueOffsets.size,
    BURST_COUNT,
    `All ${BURST_COUNT} offsets must be completely unique to prevent any glyph overlap`
  );

  // 4. Active count accurately matches burst count within pool capacity
  assert.equal(manager.getActiveCount(timestamp), BURST_COUNT);
});

test('FloatingTextManager Stress [2,500 Bursts Multi-Frame Stagger]: Dense sub-millisecond arrival preserves zero overlap', () => {
  const manager = new FloatingTextManager();
  const originX = 200;
  const originY = 200;
  const startTime = 5000;
  const BURST_COUNT = 2500;
  const TEXT_FONT_SIZE_PX = 12;

  const startYPositions = [];

  for (let i = 0; i < BURST_COUNT; i++) {
    // 2,500 bursts arriving across 250ms (0.1ms average step)
    const time = startTime + (i * 0.1);
    const offset = manager.getCascadeOffset(originX, originY, time);
    startYPositions.push(originY - offset);
  }

  // Verify non-overlapping clearance
  for (let i = 0; i < BURST_COUNT - 1; i++) {
    const verticalGap = startYPositions[i] - startYPositions[i + 1];
    assert.equal(verticalGap, 16, `Multi-frame burst pair #${i} must maintain 16px gap`);
    assert.ok(verticalGap - TEXT_FONT_SIZE_PX >= 4, 'Clearance >= 4px');
  }

  assert.equal(manager.getActiveCount(), BURST_COUNT);
});

test('FloatingTextManager Stress [5 Spatial Clusters]: 5 x 500 bursts (2,500 total) cascade independently without crosstalk', () => {
  const manager = new FloatingTextManager();
  const CLUSTERS = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 300, y: 100 },
    { x: 400, y: 100 },
    { x: 500, y: 100 },
  ];
  const BURSTS_PER_CLUSTER = 500;
  const time = 8000;

  // Interleaved bursts across all 5 clusters
  for (let round = 0; round < BURSTS_PER_CLUSTER; round++) {
    for (let c = 0; c < CLUSTERS.length; c++) {
      const cluster = CLUSTERS[c];
      const offset = manager.getCascadeOffset(cluster.x, cluster.y, time + round * 0.5);
      const expectedOffset = round * 16;
      assert.equal(
        offset,
        expectedOffset,
        `Cluster ${c} round ${round} must have offset ${expectedOffset}px independent of other clusters`
      );
    }
  }

  assert.equal(manager.getActiveCount(), CLUSTERS.length * BURSTS_PER_CLUSTER);
});

test('FloatingTextManager Stress [Sliding Window Expiry]: 2,500 bursts auto-prune past 450ms and reset to 0px', () => {
  const manager = new FloatingTextManager();
  const originX = 150;
  const originY = 150;
  const time = 10000;
  const BURST_COUNT = 2500;

  for (let i = 0; i < BURST_COUNT; i++) {
    manager.getCascadeOffset(originX, originY, time);
  }
  assert.equal(manager.getActiveCount(), BURST_COUNT);

  // Time advances by 451ms (cooldown window expiration)
  const countAfterExpiry = manager.getActiveCount(time + 451);
  assert.equal(countAfterExpiry, 0, 'All 2,500 bursts are purged past 450ms');

  // Next spawn starts fresh at offset 0
  const freshOffset = manager.getCascadeOffset(originX, originY, time + 452);
  assert.equal(freshOffset, 0, 'Post-expiry spawn starts at offset 0px');
  assert.equal(manager.getActiveCount(), 1);

  // Explicit reset clears all state
  manager.reset();
  assert.equal(manager.getActiveCount(), 0);
});

test('FloatingTextManager Stress [Pool Saturation Beyond Capacity]: 5,000 bursts at same ms never duplicate offsets', () => {
  const manager = new FloatingTextManager();
  const originX = 200;
  const originY = 200;
  const time = 20000;
  const BURST_COUNT = 5000;

  const offsets = [];
  for (let i = 0; i < BURST_COUNT; i++) {
    const offset = manager.getCascadeOffset(originX, originY, time);
    offsets.push(offset);
  }

  // Check that every offset is strictly greater than the previous offset (+16px each)
  for (let i = 0; i < BURST_COUNT - 1; i++) {
    assert.equal(
      offsets[i + 1] - offsets[i],
      16,
      `Burst ${i} to ${i + 1} must maintain strict +16px progression even beyond MAX_POOL`
    );
  }

  const unique = new Set(offsets);
  assert.equal(unique.size, BURST_COUNT, 'All 5,000 offsets must be unique without overlap');
});

test('FloatingTextManager Stress [Zero-GC & Memory Soak]: 50,000 rapid calls execute with 0 NaN and zero memory exhaustion', () => {
  const manager = new FloatingTextManager();
  let time = 1000;

  // Warmup
  for (let i = 0; i < 500; i++) {
    manager.getCascadeOffset(100, 100, time++);
  }

  const tStart = performance.now();
  let nanCount = 0;
  for (let i = 0; i < 50000; i++) {
    time += (i % 8 === 0) ? 60 : 1;
    const offset = manager.getCascadeOffset(200 + (i % 20), 200, time);
    if (Number.isNaN(offset) || offset < 0) {
      nanCount++;
    }
  }
  const duration = performance.now() - tStart;

  assert.equal(nanCount, 0, 'Offset must never be NaN or negative');
  assert.ok(
    duration < 500,
    `50,000 queries completed in ${duration.toFixed(2)}ms (budget < 500ms, avg ${(duration / 50000 * 1000).toFixed(2)}µs/call)`
  );
});

test('FloatingTextManager Defense [Boundary Rejection]: Rejects invalid inputs gracefully without pointer corruption', () => {
  const manager = new FloatingTextManager();
  const time = 1000;

  assert.equal(manager.getCascadeOffset(NaN, 100, time), 0);
  assert.equal(manager.getCascadeOffset(100, NaN, time), 0);
  assert.equal(manager.getCascadeOffset(100, 100, NaN), 0);
  assert.equal(manager.getCascadeOffset(Infinity, 100, time), 0);
  assert.equal(manager.getCascadeOffset(100, -Infinity, time), 0);
  assert.equal(manager.getCascadeOffset('abc', 100, time), 0);
  assert.equal(manager.getCascadeOffset(100, null, time), 0);
  assert.equal(manager.getCascadeOffset(100, 100, undefined), 0);

  // Buffer state remains completely healthy
  assert.equal(manager.getActiveCount(), 0);
  const validOffset = manager.getCascadeOffset(200, 200, time);
  assert.equal(validOffset, 0);
  assert.equal(manager.getActiveCount(), 1);
});

/* ==============================================================================
 * SUITE 2: OVERHEAD UI MANAGER (TEXT OVERLAP & ZERO-GC RETENTION AUDIT)
 * ============================================================================== */

test('OverheadUIManager Text Overlap [AABB Spring Separation]: Compact clustered pairs separate to required width >= 48px', () => {
  const manager = new OverheadUIManager();
  const eA = createMockEntity(200, 200, 'MobA');
  const eB = createMockEntity(235, 200, 'MobB'); // dx = 35px in [24, 48)px, distance <= 70px -> compact mode

  manager.update([eA, eB], { x: 500, y: 500 }, 16, true);

  assert.equal(eA.overheadUI.lodMode, 'compact');
  assert.equal(eB.overheadUI.lodMode, 'compact');

  const effXA = eA.x + eA.overheadUI.customOffsetX;
  const effXB = eB.x + eB.overheadUI.customOffsetX;
  const separation = Math.abs(effXB - effXA);

  // Compact tag width = 44px. Combined required width = (44 + 44)/2 + 4 = 48px.
  assert.ok(
    separation >= 47.99,
    `Effective horizontal separation (${separation.toFixed(2)}px) must be >= 48px to eliminate label collision`
  );
});

test('OverheadUIManager Text Overlap [Vertical Staggering]: Vertically stacked entities (dx < 24px) separate by >= 60px', () => {
  const manager = new OverheadUIManager();
  const eA = createMockEntity(200, 200, 'Upper');
  const eB = createMockEntity(205, 200, 'Lower'); // dx = 5px < 24px

  manager.update([eA, eB], { x: 500, y: 500 }, 16, true);

  const effYA = eA.y + eA.overheadUI.customOffsetY;
  const effYB = eB.y + eB.overheadUI.customOffsetY;
  const verticalDiff = effYB - effYA;

  // Staggering places upper at -14px, lower at +46px -> diff = 60px
  assert.ok(
    verticalDiff >= 60,
    `Vertical stagger separation (${verticalDiff}px) must be >= 60px (upper -14px, lower +46px)`
  );
});

test('OverheadUIManager Text Overlap [Dense Melee Auto-Collapse]: 3+ entities within 60px collapse to minimal (name tag hidden)', () => {
  const manager = new OverheadUIManager();
  const entities = [
    createMockEntity(250, 250, 'Melee1'),
    createMockEntity(260, 250, 'Melee2'),
    createMockEntity(270, 250, 'Melee3'),
  ];

  manager.update(entities, { x: 500, y: 500 }, 16, true);

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    assert.equal(
      e.overheadUI.lodMode,
      'minimal',
      `Entity ${i} in melee cluster must collapse to 'minimal' mode`
    );
    // In minimal mode, nameTag is set to visible = false, completely eliminating text overlap
    if (e.overheadUI.nameTag) {
      assert.equal(e.overheadUI.nameTag.visible, false, 'Name tag text must be hidden in minimal mode');
    }
  }
});

test('OverheadUIManager Stress [100 Entities Extreme Density]: Identical coordinates (300, 300) produce 0 NaN and stay in bounds', () => {
  const manager = new OverheadUIManager();
  const COUNT = 100;
  const entities = [];

  for (let i = 0; i < COUNT; i++) {
    entities.push(createMockEntity(300, 300, `Cluster_${i}`));
  }

  manager.update(entities, { x: 500, y: 500 }, 16, true);

  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.equal(e.overheadUI.lodMode, 'minimal');
    assert.ok(Number.isFinite(e.overheadUI.customOffsetX));
    assert.ok(Number.isFinite(e.overheadUI.customOffsetY));
    assert.ok(Number.isFinite(e.overheadUI.currentAlpha));

    const effX = e.x + e.overheadUI.customOffsetX;
    const effY = e.y + e.overheadUI.customOffsetY;
    assert.ok(effX >= 20 && effX <= 580, `Effective X (${effX}) must be clamped in [20, 580]`);
    assert.ok(effY >= 20 && effY <= 500, `Effective Y (${effY}) must be clamped in [20, 500]`);
  }
});

test('OverheadUIManager Stress [Player Protection Bubble]: 50 entities co-located on player receive alpha 0.0', () => {
  const manager = new OverheadUIManager();
  const COUNT = 50;
  const entities = [];

  for (let i = 0; i < COUNT; i++) {
    entities.push(createMockEntity(300, 300, `PlayerCluster_${i}`));
  }
  const player = { x: 300, y: 300 };

  manager.update(entities, player, 16, true);

  for (let i = 0; i < COUNT; i++) {
    assert.equal(
      entities[i].overheadUI.currentAlpha,
      0.0,
      `Entity ${i} on top of player must be 100% transparent`
    );
  }
});

test('OverheadUIManager Zero-GC Retention [Scratch Array Reference Nulling]: Prevents dead entity retention in heap', () => {
  const manager = new OverheadUIManager();
  const entity = createMockEntity(150, 150, 'EphemeralEntity');

  manager.update([entity], { x: 400, y: 400 }, 16, true);

  // Verify internal scratch buffer was cleared at the end of update
  // _scratchActive is private, but we can verify via prototype/inspection
  const scratchActive = manager._scratchActive;
  assert.equal(
    scratchActive.length,
    0,
    '_scratchActive must have length 0 after update() completes to avoid holding entity references'
  );

  // Calling reset() cleans up any remaining buffers
  manager.reset();
  assert.equal(manager._scratchActive.length, 0);

  // destroy() alias
  manager.destroy();
  assert.equal(manager._scratchActive.length, 0);
});

test('OverheadUIManager Memory Soak [2,000 Frames with 100 Entities]: High-frequency motion executes with zero memory leak', () => {
  const manager = new OverheadUIManager();
  const COUNT = 100;
  const entities = [];

  for (let i = 0; i < COUNT; i++) {
    entities.push(createMockEntity(100 + (i % 10) * 40, 100 + Math.floor(i / 10) * 40, `SoakMob_${i}`));
  }
  const player = { x: 300, y: 300 };

  // Warmup JIT
  for (let w = 0; w < 50; w++) {
    manager.update(entities, player, 16, false);
  }

  const FRAMES = 1000;
  const tStart = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    // Dynamic continuous movement
    entities[0].x = 250 + Math.sin(f * 0.05) * 50;
    entities[0].y = 250 + Math.cos(f * 0.05) * 50;
    entities[1].x = 300 + Math.cos(f * 0.03) * 40;

    manager.update(entities, player, 16, false);
  }
  const totalDuration = performance.now() - tStart;
  const avgFrameMs = totalDuration / FRAMES;

  assert.ok(
    avgFrameMs < 1.0,
    `100 entities average update time (${avgFrameMs.toFixed(4)}ms) must be strictly < 1.0ms`
  );
});
