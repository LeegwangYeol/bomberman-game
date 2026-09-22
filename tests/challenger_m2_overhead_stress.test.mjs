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
  OverheadUIManager,
} = await import('../src/game/GameScene.ts');

const {
  OverheadUI,
} = await import('../src/game/entities/OverheadUI.ts');

/* ==============================================================================
 * MOCK ENTITY GENERATOR
 * ============================================================================== */

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
 * CHALLENGER STRESS SUITE 1: 50+ CLUSTERED ENTITIES AT IDENTICAL COORDINATES
 * ============================================================================== */

test('Challenger M2 [Density Stress]: 50 entities at exact same coordinates (300, 300) collapse safely into minimal LOD', () => {
  const manager = new OverheadUIManager();
  const entities = [];
  const COUNT = 50;

  for (let i = 0; i < COUNT; i++) {
    entities.push(createMockEntity(300, 300, `ClusterMob ${i}`));
  }
  const player = { x: 500, y: 500 };

  manager.update(entities, player, 16, true);

  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.equal(
      e.overheadUI.lodMode,
      'minimal',
      `Entity ${i} in 50-entity cluster must be set to 'minimal' LOD mode`
    );
    assert.ok(
      !Number.isNaN(e.overheadUI.customOffsetX),
      `Entity ${i} customOffsetX must not be NaN`
    );
    assert.ok(
      !Number.isNaN(e.overheadUI.customOffsetY),
      `Entity ${i} customOffsetY must not be NaN`
    );
    assert.ok(
      !Number.isNaN(e.overheadUI.currentAlpha),
      `Entity ${i} currentAlpha must not be NaN`
    );
    assert.ok(
      e.overheadUI.currentAlpha >= 0 && e.overheadUI.currentAlpha <= 1.0,
      `Entity ${i} currentAlpha must be in [0, 1]`
    );

    // Render layers check
    const layers = e.overheadUI.getRenderLayers(true);
    assert.ok(!Number.isNaN(layers.tier1_hp.x), 'HP bar x must be valid number');
    assert.ok(!Number.isNaN(layers.tier1_hp.y), 'HP bar y must be valid number');
    assert.ok(!Number.isNaN(layers.tier2_name.x), 'Name x must be valid number');
    assert.ok(!Number.isNaN(layers.tier2_name.y), 'Name y must be valid number');
  }
});

test('Challenger M2 [Density Stress]: 50 entities co-located on top of player (300, 300) trigger total bubble transparency', () => {
  const manager = new OverheadUIManager();
  const entities = [];
  const COUNT = 50;

  for (let i = 0; i < COUNT; i++) {
    entities.push(createMockEntity(300, 300, `PlayerClusterMob ${i}`));
  }
  const player = { x: 300, y: 300 };

  manager.update(entities, player, 16, true);

  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.equal(e.overheadUI.lodMode, 'minimal');
    assert.equal(
      e.overheadUI.currentAlpha,
      0.0,
      `Entity ${i} directly on player must have alpha 0.0`
    );
  }
});

test('Challenger M2 [Density Stress]: 100 entities packed into a tight 20x20 box maintain finite numerical stability', () => {
  const manager = new OverheadUIManager();
  const entities = [];
  const COUNT = 100;

  for (let i = 0; i < COUNT; i++) {
    const rx = 290 + (i % 10) * 2;
    const ry = 290 + Math.floor(i / 10) * 2;
    entities.push(createMockEntity(rx, ry, `DenseMob ${i}`));
  }
  const player = { x: 450, y: 450 };

  manager.update(entities, player, 16, true);

  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.equal(e.overheadUI.lodMode, 'minimal', `Dense cluster entity ${i} must be minimal`);
    assert.ok(Number.isFinite(e.overheadUI.customOffsetX), `OffsetX ${i} must be finite`);
    assert.ok(Number.isFinite(e.overheadUI.customOffsetY), `OffsetY ${i} must be finite`);
    assert.ok(Number.isFinite(e.overheadUI.currentAlpha), `Alpha ${i} must be finite`);
  }
});

/* ==============================================================================
 * CHALLENGER STRESS SUITE 2: ARENA BOUNDARY CLAMPING [20, 580]
 * ============================================================================== */

test('Challenger M2 [Boundary Clamping]: 50 entities stacked at left arena bound (x=20) strictly clamp within [20, 580]', () => {
  const manager = new OverheadUIManager();
  const entities = [];
  const COUNT = 50;

  for (let i = 0; i < COUNT; i++) {
    entities.push(createMockEntity(20, 200 + (i % 5) * 5, `LeftMob ${i}`));
  }
  const player = { x: 400, y: 400 };

  manager.update(entities, player, 16, true);

  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    const effectiveX = e.x + e.overheadUI.customOffsetX;
    assert.ok(
      effectiveX >= 20,
      `Entity ${i} effectiveX (${effectiveX}) must not be less than left bound 20`
    );
    assert.ok(
      effectiveX <= 580,
      `Entity ${i} effectiveX (${effectiveX}) must not exceed right bound 580`
    );
  }
});

test('Challenger M2 [Boundary Clamping]: 50 entities stacked at right arena bound (x=580) strictly clamp within [20, 580]', () => {
  const manager = new OverheadUIManager();
  const entities = [];
  const COUNT = 50;

  for (let i = 0; i < COUNT; i++) {
    entities.push(createMockEntity(580, 200 + (i % 5) * 5, `RightMob ${i}`));
  }
  const player = { x: 100, y: 100 };

  manager.update(entities, player, 16, true);

  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    const effectiveX = e.x + e.overheadUI.customOffsetX;
    assert.ok(
      effectiveX >= 20,
      `Entity ${i} effectiveX (${effectiveX}) must not be less than left bound 20`
    );
    assert.ok(
      effectiveX <= 580,
      `Entity ${i} effectiveX (${effectiveX}) must not exceed right bound 580`
    );
  }
});

test('Challenger M2 [Boundary Clamping]: Entities outside arena bounds (negative X and extreme positive X) are pulled into [20, 580]', () => {
  const manager = new OverheadUIManager();
  const eFarLeft = createMockEntity(-100, 200, 'FarLeft');
  const eFarRight = createMockEntity(800, 200, 'FarRight');
  const eZero = createMockEntity(0, 200, 'Zero');
  const eExact600 = createMockEntity(600, 200, 'Exact600');

  manager.update([eFarLeft, eFarRight, eZero, eExact600], null, 16, true);

  assert.equal(eFarLeft.x + eFarLeft.overheadUI.customOffsetX, 20, 'Far left entity clamped to 20');
  assert.equal(eFarRight.x + eFarRight.overheadUI.customOffsetX, 580, 'Far right entity clamped to 580');
  assert.equal(eZero.x + eZero.overheadUI.customOffsetX, 20, 'Zero entity clamped to 20');
  assert.equal(eExact600.x + eExact600.overheadUI.customOffsetX, 580, '600 entity clamped to 580');
});

test('Challenger M2 [Boundary Clamping]: High repulsion cascade near wall does not breach [20, 580]', () => {
  const manager = new OverheadUIManager();
  const entities = [];
  for (let i = 0; i < 6; i++) {
    entities.push(createMockEntity(22 + i * 25, 200, `WallLine ${i}`));
  }

  manager.update(entities, null, 16, true);

  for (let i = 0; i < entities.length; i++) {
    const effX = entities[i].x + entities[i].overheadUI.customOffsetX;
    assert.ok(
      effX >= 20 && effX <= 580,
      `Entity ${i} effective X (${effX}) must remain within [20, 580] despite cascade repulsion`
    );
  }
});

test('Challenger M2 [Boundary Clamping]: 50 entities arranged in horizontal repulsion cascade all respect [20, 580]', () => {
  const manager = new OverheadUIManager();
  const entities = [];
  const COUNT = 50;

  // 50 entities spaced by 25px across the arena (from x = 20 to x = 580)
  for (let i = 0; i < COUNT; i++) {
    entities.push(createMockEntity(20 + (i % 23) * 25, 200 + Math.floor(i / 23) * 10, `RepulseMob ${i}`));
  }

  manager.update(entities, null, 16, true);

  for (let i = 0; i < COUNT; i++) {
    const effX = entities[i].x + entities[i].overheadUI.customOffsetX;
    assert.ok(
      effX >= 20 && effX <= 580,
      `Entity ${i} effective X (${effX}) must remain within [20, 580]`
    );
  }
});

/* ==============================================================================
 * CHALLENGER STRESS SUITE 3: ADAPTIVE LOD DYNAMICS & THRESHOLD TRANSITIONS
 * ============================================================================== */

test('Challenger M2 [LOD Transitions]: Distance sweep from 120px to 10px correctly transitions full -> compact -> minimal', () => {
  const manager = new OverheadUIManager();
  const center = createMockEntity(300, 300, 'Boss: Central');
  const neighbor1 = createMockEntity(320, 300, 'Ally: Helper'); // 20px from center
  const probe = createMockEntity(420, 300, 'Chaser: Probe'); // initially 120px away from center, 100px from neighbor1
  const player = { x: 50, y: 50 }; // far away (> 200px)

  // 1. Probe is 120px away: Solo mode (dist > 70px)
  manager.update([center, probe], player, 16, true);
  assert.equal(probe.overheadUI.lodMode, 'full', 'Probe at 120px must be full');

  // 2. Probe moves to 68px away from center: Clustered mode (dist <= 70px, countWithin60 = 0)
  probe.x = 368;
  manager.update([center, probe], player, 16, true);
  assert.equal(probe.overheadUI.lodMode, 'compact', 'Probe at 68px must be compact');

  // 3. Move probe to 340px and activate neighbor1 at 320px:
  // center at 300, neighbor1 at 320, probe at 340.
  // Distances: center-neighbor=20px, neighbor-probe=20px, center-probe=40px.
  // All pairs are <= 60px! Each has 2 neighbors <= 60px!
  probe.x = 340;
  manager.update([center, neighbor1, probe], player, 16, true);
  assert.equal(center.overheadUI.lodMode, 'minimal', 'Center with 2 neighbors <= 60px must be minimal');
  assert.equal(neighbor1.overheadUI.lodMode, 'minimal', 'Neighbor1 with 2 neighbors <= 60px must be minimal');
  assert.equal(probe.overheadUI.lodMode, 'minimal', 'Probe with 2 neighbors <= 60px must be minimal');

  // 4. Probe retreats to 450px away: returns to full
  probe.x = 450;
  manager.update([center, neighbor1, probe], player, 16, true);
  assert.equal(probe.overheadUI.lodMode, 'full', 'Probe at 450px must return to full');
  assert.equal(center.overheadUI.lodMode, 'compact', 'Center with 1 neighbor at 20px must be compact');
  assert.equal(neighbor1.overheadUI.lodMode, 'compact', 'Neighbor1 with 1 neighbor at 20px must be compact');
});

test('Challenger M2 [LOD Transitions]: 50 entities exploding outward from cluster dynamically transition minimal -> compact -> full', () => {
  const manager = new OverheadUIManager();
  const entities = [];
  const COUNT = 50;

  for (let i = 0; i < COUNT; i++) {
    entities.push(createMockEntity(300, 300, `ExpMob ${i}`));
  }
  const player = { x: 999, y: 999 }; // placed completely outside the arena

  // Frame 0: All 50 co-located -> minimal
  manager.update(entities, player, 16, true);
  for (const e of entities) {
    assert.equal(e.overheadUI.lodMode, 'minimal');
  }

  // Frame 1: Spread entities out onto a wide 10x5 grid with 80px spacing (dist > 70px)
  for (let i = 0; i < COUNT; i++) {
    const col = i % 10;
    const row = Math.floor(i / 10);
    entities[i].x = 50 + col * 80;
    entities[i].y = 100 + row * 80;
  }

  manager.update(entities, player, 16, true);
  // Grid neighbors at 80px distance -> all > 70px and player far away
  for (let i = 0; i < COUNT; i++) {
    assert.equal(
      entities[i].overheadUI.lodMode,
      'full',
      `Spread entity ${i} (spacing 80px) must dynamically upgrade to 'full' LOD`
    );
  }
});

test('Challenger M2 [LOD Transitions]: High-frequency oscillation (500 frames) between full and compact does not leak or crash', () => {
  const manager = new OverheadUIManager();
  const e1 = createMockEntity(200, 200, 'Osc1');
  const e2 = createMockEntity(300, 200, 'Osc2');
  const player = { x: 800, y: 800 };

  for (let f = 0; f < 500; f++) {
    // Alternate distance: 65px (compact) vs 95px (full)
    e2.x = f % 2 === 0 ? 265 : 295;
    manager.update([e1, e2], player, 16, true);

    const expectedMode = f % 2 === 0 ? 'compact' : 'full';
    assert.equal(e1.overheadUI.lodMode, expectedMode);
    assert.equal(e2.overheadUI.lodMode, expectedMode);
  }
});

/* ==============================================================================
 * CHALLENGER STRESS SUITE 4: PERFORMANCE BENCHMARK (< 1ms under 50 entities)
 * ============================================================================== */

test('Challenger M2 [Performance]: 50 entities over 1,000 frames execute in < 0.2ms/frame average (budget: < 1.0ms)', () => {
  const manager = new OverheadUIManager();
  const entities = [];
  const COUNT = 50;

  for (let i = 0; i < COUNT; i++) {
    entities.push(createMockEntity(100 + (i % 7) * 40, 100 + Math.floor(i / 7) * 40, `PerfMob ${i}`));
  }
  const player = { x: 300, y: 300 };

  // Warmup JIT
  for (let w = 0; w < 20; w++) {
    manager.update(entities, player, 16, false);
  }

  const ITERATIONS = 500;
  const totalStart = performance.now();
  for (let f = 0; f < ITERATIONS; f++) {
    // Dynamic entity motion to prevent static branch caching
    entities[0].x = 250 + Math.sin(f * 0.05) * 50;
    entities[0].y = 250 + Math.cos(f * 0.05) * 50;
    entities[1].x = 300 + Math.cos(f * 0.03) * 40;

    manager.update(entities, player, 16, false);
  }
  const totalDuration = performance.now() - totalStart;
  const avgFrameTime = totalDuration / ITERATIONS;

  assert.ok(
    avgFrameTime < 1.0,
    `Average frame time (${avgFrameTime.toFixed(4)}ms) must be strictly < 1.0ms budget for 50 entities`
  );
});

test('Challenger M2 [Performance Scale]: 100 entities stress test still respects frame budget (< 1.5ms)', () => {
  const manager = new OverheadUIManager();
  const entities = [];
  const COUNT = 100;

  for (let i = 0; i < COUNT; i++) {
    entities.push(createMockEntity(150 + (i % 10) * 30, 150 + Math.floor(i / 10) * 30, `ScaleMob ${i}`));
  }
  const player = { x: 300, y: 300 };

  const ITERATIONS = 200;
  const tStart = performance.now();
  for (let f = 0; f < ITERATIONS; f++) {
    manager.update(entities, player, 16, false);
  }
  const totalTime = performance.now() - tStart;
  const avgTime = totalTime / ITERATIONS;

  assert.ok(
    avgTime < 1.5,
    `100 entities average execution time (${avgTime.toFixed(4)}ms) should stay well under 1.5ms`
  );
});

/* ==============================================================================
 * CHALLENGER STRESS SUITE 5: ADVERSARIAL EDGE CASES & RESOURCE DEFENSE
 * ============================================================================== */

test('Challenger M2 [Adversarial Resilience]: Garbage & inactive entity filtering handles dirty arrays without crashing', () => {
  const manager = new OverheadUIManager();
  const normalEntity = createMockEntity(200, 200, 'Alive');
  const deadEntity = createMockEntity(200, 200, 'Dead');
  deadEntity.isDead = true;

  const inactiveEntity = createMockEntity(200, 200, 'Inactive');
  inactiveEntity.active = false;

  const destroyedUIEntity = createMockEntity(200, 200, 'Destroyed');
  destroyedUIEntity.overheadUI.destroy();

  const dirtyList = [
    null,
    undefined,
    normalEntity,
    deadEntity,
    inactiveEntity,
    destroyedUIEntity,
    null,
  ];

  // Must not throw or error
  assert.doesNotThrow(() => {
    // Player far away (> 70px) so normalEntity remains in 'full' mode
    manager.update(dirtyList, { x: 500, y: 500 }, 16, true);
  });

  assert.equal(normalEntity.overheadUI.lodMode, 'full', 'Only 1 active entity remains in dirty list');
});

test('Challenger M2 [Adversarial Resilience]: Extreme delta values (0ms, 100,000ms, negative) never produce NaN or alpha overflow', () => {
  const manager = new OverheadUIManager();
  const entity = createMockEntity(200, 200, 'DeltaTest');
  const player = { x: 200, y: 200 };

  // Delta = 0
  manager.update([entity], player, 0, false);
  assert.ok(!Number.isNaN(entity.overheadUI.currentAlpha), 'Delta 0 produces valid alpha');

  // Delta = 100,000 (huge frame hitch / tab sleep)
  manager.update([entity], player, 100000, false);
  assert.ok(!Number.isNaN(entity.overheadUI.currentAlpha), 'Delta 100,000 produces valid alpha');
  assert.equal(entity.overheadUI.currentAlpha, 0.0, 'Full decay to 0 on massive delta');

  // Negative delta (anomalous clock drift)
  manager.update([entity], { x: 500, y: 500 }, -16, false);
  assert.ok(!Number.isNaN(entity.overheadUI.currentAlpha), 'Negative delta produces valid alpha');
});
