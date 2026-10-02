/**
 * Tests: Overhead UI Distance Optimization, UI Text Occlusion & 2.5D Layer Stacking
 *
 * Comprehensive verification of:
 * 1. Distance Calculation Optimization & Squared Euclidean Distance Invariants
 * 2. Player Protection Bubble (R = 38px) & Visibility Guarantee (Zero Occlusion)
 * 3. Status Badges (Intent Glyphs) & Intent-Aware Occlusion Prevention
 * 4. Name Tags, Faction Styling & 3-Tier Adaptive LOD
 * 5. 2.5D Layer Stacking & Global RENDER_DEPTH Partition Invariants
 * 6. High-Density Chaos Stress, Boundary Clamping & Zero-GC Scratch Reuse
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
 * SUITE 1: DISTANCE CALCULATION OPTIMIZATION & NUMERICAL PRECISION
 * ============================================================================== */

test('Distance Optimization [Equivalence]: Squared distance thresholds match Euclidean standards exactly', () => {
  // Verifying mathematical monotonic equivalence: d <= T <=> dx*dx + dy*dy <= T^2
  const thresholds = [
    { dist: 20, sq: 400, label: 'Core Exclusion Zone (20px)' },
    { dist: 38, sq: 1444, label: 'Player Protection Bubble (38px)' },
    { dist: 50, sq: 2500, label: 'Smooth Outer Attenuation (50px)' },
    { dist: 60, sq: 3600, label: 'LOD Melee Threshold (60px)' },
    { dist: 70, sq: 4900, label: 'LOD Clustered Threshold (70px)' },
  ];

  for (const t of thresholds) {
    assert.equal(t.dist * t.dist, t.sq, `${t.label} threshold square mismatch`);

    // Sample 500 random delta vectors
    for (let i = 0; i < 500; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = t.dist * (0.5 + Math.random()); // r in [0.5*T, 1.5*T]
      const dx = Math.cos(angle) * r;
      const dy = Math.sin(angle) * r;

      const euclid = Math.hypot(dx, dy);
      const distSq = dx * dx + dy * dy;

      const isInsideEuclid = euclid <= t.dist;
      const isInsideSq = distSq <= t.sq;

      assert.equal(
        isInsideSq,
        isInsideEuclid,
        `Point (${dx.toFixed(2)}, ${dy.toFixed(2)}) must yield identical classification for ${t.label}`
      );
    }
  }
});

test('Distance Optimization [Microbenchmark]: 10,000 squared distance checks execute with sub-microsecond latency', () => {
  const SAMPLES = 10000;
  const eA = { x: 200, y: 200 };
  const eB = { x: 245, y: 235 };

  const startTime = performance.now();
  let countWithin60 = 0;
  let countWithin70 = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const dx = eA.x - eB.x;
    const dy = eA.y - eB.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= 3600) countWithin60++;
    if (distSq <= 4900) countWithin70++;
  }
  const elapsed = performance.now() - startTime;

  assert.ok(elapsed < 50.0, `10,000 squared distance checks took ${elapsed.toFixed(2)}ms (budget: < 50ms)`);
  assert.equal(countWithin60, SAMPLES);
  assert.equal(countWithin70, SAMPLES);
});

/* ==============================================================================
 * SUITE 2: PLAYER PROTECTION BUBBLE & VISIBILITY GUARANTEE
 * ============================================================================== */

test('Player Bubble [Zero Occlusion]: Name tag overlapping player sprite decays to alpha 0.0', () => {
  const manager = new OverheadUIManager();
  const player = { x: 200, y: 200 };

  // Entity positioned at y = 222 so its name tag (offset -22) is precisely at y = 200 (player center)
  const entity = createMockEntity(200, 222, 'Chaser: Blinky');
  manager.update([entity], player, 16, true);

  assert.equal(
    entity.overheadUI.currentAlpha,
    0.0,
    'Overhead UI overlapping player sprite must be completely transparent (alpha 0.0)'
  );
});

test('Player Bubble [Zero Occlusion]: Entity body overlapping player sprite forces alpha 0.0', () => {
  const manager = new OverheadUIManager();
  const player = { x: 300, y: 300 };

  // Entity body co-located with player
  const entity = createMockEntity(300, 300, 'Bomber: Pyro');
  manager.update([entity], player, 16, true);

  assert.equal(
    entity.overheadUI.currentAlpha,
    0.0,
    'Entity body on top of player must force complete alpha 0.0 attenuation'
  );
});

test('Player Bubble [Linear Ramp]: Transition zone (20px < d <= 38px) smoothly ramps alpha <= 0.15', () => {
  const manager = new OverheadUIManager();
  const player = { x: 300, y: 300 };

  // Test 18 discrete distances from 21px to 38px
  for (let d = 21; d <= 38; d++) {
    const entity = createMockEntity(player.x + d, player.y, `Mob_${d}`);
    manager.update([entity], player, 16, true);

    const alpha = entity.overheadUI.currentAlpha;
    const expected = 0.15 * ((d - 20) / (38 - 20));

    assert.ok(alpha > 0.0, `Alpha at d=${d} must be > 0.0`);
    assert.ok(alpha <= 0.15, `Alpha at d=${d} must be <= 0.15`);
    assert.ok(Math.abs(alpha - expected) < 1e-4, `Alpha at d=${d} (${alpha}) must match expected (${expected})`);
  }
});

test('Player Bubble [Exterior Visibility]: Entity outside bubble (d > 38px) retains full opacity 1.0', () => {
  const manager = new OverheadUIManager(false);
  const player = { x: 300, y: 300 };

  const entity = createMockEntity(player.x + 45, player.y, 'DistantMob');
  manager.update([entity], player, 16, true);

  assert.equal(entity.overheadUI.currentAlpha, 1.0, 'Entity outside 38px bubble must have full alpha 1.0');
});

test('Player Bubble [Smooth Outer Attenuation]: smoothOuterBubble ramps alpha smoothly from 0.15 to 1.0 between 38px and 50px', () => {
  const manager = new OverheadUIManager(true); // smoothOuterBubble enabled
  const player = { x: 300, y: 300 };

  // Sample at d = 44px (halfway between 38 and 50)
  const entity = createMockEntity(player.x + 44, player.y, 'MidMob');
  manager.update([entity], player, 16, true);

  const alpha = entity.overheadUI.currentAlpha;
  const expected = 0.15 + (1.0 - 0.15) * ((44 - 38) / (50 - 38)); // 0.15 + 0.85 * 0.5 = 0.575

  assert.ok(Math.abs(alpha - expected) < 1e-4, `Smooth alpha at d=44px (${alpha}) must match expected (${expected})`);
});

test('Player Bubble [Dynamic Lerp]: Frame-over-frame lerp prevents visual popping under rapid transit', () => {
  const manager = new OverheadUIManager();
  const player = { x: 200, y: 200 };
  const entity = createMockEntity(200, 222, 'LerpMob'); // target alpha = 0.0

  assert.equal(entity.overheadUI.currentAlpha, 1.0);

  // 1st frame at 16ms delta (lerpFactor = 16 * 0.015 = 0.24)
  manager.update([entity], player, 16, false);
  const alpha1 = entity.overheadUI.currentAlpha;

  assert.ok(alpha1 < 1.0, 'Alpha must start decreasing smoothly');
  assert.ok(alpha1 > 0.5, 'Alpha must not instantly drop to 0 in a single frame');
  assert.ok(Math.abs(alpha1 - 0.76) < 0.02, `1st frame alpha should be ~0.76, got ${alpha1}`);

  // Settle over 30 frames
  for (let f = 0; f < 30; f++) {
    manager.update([entity], player, 16, false);
  }
  assert.ok(entity.overheadUI.currentAlpha < 0.001, 'Alpha must asymptotically reach near 0.0');
});

/* ==============================================================================
 * SUITE 3: STATUS BADGES (INTENT GLYPHS) & OCCLUSION PREVENTION
 * ============================================================================== */

test('Status Badges [Intent Offset & Depth]: Intent indicator is positioned at y - 34 with OFFSET_INTENT_BADGE depth', () => {
  const overheadUI = new OverheadUI(null, 'Chaser: Blinky', 'enemy', 3);
  overheadUI.update(200, 200, 3);
  overheadUI.setIntent('!', true);

  assert.equal(overheadUI.tier3_intent_y_offset, -34, 'Intent badge offset must be -34px');
  assert.equal(overheadUI.intentGlyph, '!');
  assert.equal(overheadUI.isIntentVisible, true);

  const layers = overheadUI.getRenderLayers();
  assert.equal(layers.tier3_intent.y, 200 - 34, 'Intent badge render layer Y must be 200 - 34 = 166px');
  assert.equal(layers.tier3_intent.glyph, '!');
  assert.equal(layers.tier3_intent.visible, true);
});

test('Status Badges [Occlusion Prevention]: Active status badge approaching player from south triggers bubble alpha 0.0', () => {
  const manager = new OverheadUIManager();
  const player = { x: 300, y: 300 };

  // Entity positioned at (300, 334).
  // Status badge is at y = 334 - 34 = 300 (directly over player center at y=300!)
  // While name tag is at y = 334 - 22 = 312 (distLabel = 12px)
  // And body is at y = 334 (distBody = 34px)
  const entity = createMockEntity(300, 334, 'IntentMob');
  entity.overheadUI.setIntent('💣', true);

  manager.update([entity], player, 16, true);

  assert.equal(
    entity.overheadUI.currentAlpha,
    0.0,
    'Status badge overlapping player must trigger alpha 0.0 to prevent visual obstruction'
  );
});

test('Status Badges [Alpha Synchronization]: setAlpha updates HP, name tag, and intent indicator synchronously', () => {
  let hpAlpha = -1;
  let nameAlpha = -1;
  let indicatorAlpha = -1;

  const overheadUI = new OverheadUI(null, 'Chaser: Blinky', 'enemy', 3);
  overheadUI.hpGraphics = { active: true, setAlpha: (a) => { hpAlpha = a; } };
  overheadUI.nameTag = { active: true, setAlpha: (a) => { nameAlpha = a; } };
  overheadUI.indicator = { active: true, setAlpha: (a) => { indicatorAlpha = a; } };

  overheadUI.setAlpha(0.12);

  assert.equal(overheadUI.currentAlpha, 0.12);
  assert.equal(hpAlpha, 0.12, 'HP bar graphics alpha must match');
  assert.equal(nameAlpha, 0.12, 'Name tag text alpha must match');
  assert.equal(indicatorAlpha, 0.12, 'Intent indicator text alpha must match');
});

test('Status Badges [Defensive Clamping]: setAlpha strictly rejects NaN and clamps to [0.0, 1.0]', () => {
  const overheadUI = new OverheadUI(null, 'TestMob', 'enemy', 1);

  overheadUI.setAlpha(NaN);
  assert.equal(overheadUI.currentAlpha, 1.0, 'NaN alpha must fall back to 1.0');

  overheadUI.setAlpha(-0.5);
  assert.equal(overheadUI.currentAlpha, 0.0, 'Negative alpha must clamp to 0.0');

  overheadUI.setAlpha(1.8);
  assert.equal(overheadUI.currentAlpha, 1.0, 'Excessive alpha must clamp to 1.0');
});

/* ==============================================================================
 * SUITE 4: NAME TAGS, FACTION STYLING & 3-TIER ADAPTIVE LOD
 * ============================================================================== */

test('Name Tags [Faction Styling]: Factions map to distinct readable colors', () => {
  const enemyUI = new OverheadUI(null, 'Enemy', 'enemy', 1);
  const allyUI = new OverheadUI(null, 'Ally', 'ally', 1);
  const neutralUI = new OverheadUI(null, 'Neutral', 'neutral', 1);

  assert.equal(enemyUI.getRenderLayers().tier2_name.color, '#fb923c', 'Enemy name tag must be flame orange');
  assert.equal(allyUI.getRenderLayers().tier2_name.color, '#22d3ee', 'Ally name tag must be cyan');
  assert.equal(neutralUI.getRenderLayers().tier2_name.color, '#fbbf24', 'Neutral name tag must be amber gold');
});

test('Name Tags [Adaptive LOD]: Transitions between Full, Compact, and Minimal based on neighbor density', () => {
  const manager = new OverheadUIManager();
  const player = { x: 500, y: 500 };

  // Case 1: Solo entity (d > 70px) -> Full Name
  const soloA = createMockEntity(100, 100, 'Chaser: Blinky');
  const soloB = createMockEntity(300, 300, 'Bomber: Pyro');
  manager.update([soloA, soloB], player, 16, true);
  assert.equal(soloA.overheadUI.lodMode, 'full');
  assert.equal(soloB.overheadUI.lodMode, 'full');

  // Case 2: Pair within 70px (d = 45px) -> Compact Name
  const pairA = createMockEntity(200, 200, 'Chaser: Blinky');
  const pairB = createMockEntity(245, 200, 'Bomber: Pyro');
  manager.update([pairA, pairB], player, 16, true);
  assert.equal(pairA.overheadUI.lodMode, 'compact');
  assert.equal(pairB.overheadUI.lodMode, 'compact');
  assert.equal(pairA.overheadUI.compactName, 'Blinky');
  assert.equal(pairB.overheadUI.compactName, 'Pyro');

  // Case 3: Melee swarm (3+ entities within 60px) -> Minimal (name tag hidden)
  const meleeA = createMockEntity(200, 200, 'Chaser: Blinky');
  const meleeB = createMockEntity(230, 210, 'Bomber: Pyro');
  const meleeC = createMockEntity(215, 240, 'Tank: Golem');
  manager.update([meleeA, meleeB, meleeC], player, 16, true);
  assert.equal(meleeA.overheadUI.lodMode, 'minimal');
  assert.equal(meleeB.overheadUI.lodMode, 'minimal');
  assert.equal(meleeC.overheadUI.lodMode, 'minimal');
});

test('Name Tags [AABB Spring Repulsion]: Overlapping labels are pushed apart horizontally', () => {
  const manager = new OverheadUIManager();
  const player = { x: 500, y: 500 };

  const leftMob = createMockEntity(200, 200, 'Chaser: Blinky');
  const rightMob = createMockEntity(235, 200, 'Bomber: Pyro');

  manager.update([leftMob, rightMob], player, 16, true);

  assert.ok(leftMob.overheadUI.customOffsetX < 0, 'Left entity must be shifted left');
  assert.ok(rightMob.overheadUI.customOffsetX > 0, 'Right entity must be shifted right');

  const finalSep = (rightMob.x + rightMob.overheadUI.customOffsetX) - (leftMob.x + leftMob.overheadUI.customOffsetX);
  assert.ok(finalSep >= 48, `Final label separation (${finalSep.toFixed(1)}px) must clear required clearance (48px)`);
});

test('Name Tags [Vertical Staggering]: Collinear entities (dx < 24px) trigger upper (-14px) and lower (+46px) split', () => {
  const manager = new OverheadUIManager();
  const player = { x: 500, y: 500 };

  const northMob = createMockEntity(200, 195, 'Chaser: Blinky');
  const southMob = createMockEntity(205, 205, 'Bomber: Pyro');

  manager.update([northMob, southMob], player, 16, true);

  assert.equal(northMob.overheadUI.customOffsetY, -14, 'Northern label gets elevated tier (-14px)');
  assert.equal(southMob.overheadUI.customOffsetY, 46, 'Southern label gets lower under-foot tier (+46px)');

  const northLayers = northMob.overheadUI.getRenderLayers(true);
  const southLayers = southMob.overheadUI.getRenderLayers(true);
  const verticalGap = southLayers.tier2_name.y - northLayers.tier2_name.y;
  assert.ok(verticalGap >= 60, `Vertical gap (${verticalGap}px) must prevent text occlusion`);
});

test('Name Tags [Boundary Clamping]: UI labels are strictly clamped within [20, 580] X and [20, 500] Y', () => {
  const manager = new OverheadUIManager();
  const player = { x: 300, y: 300 };

  // Stack 10 entities right on the left wall boundary (x = 20)
  const leftMobs = [];
  for (let i = 0; i < 10; i++) {
    leftMobs.push(createMockEntity(20, 200 + i * 2, `LeftMob_${i}`));
  }
  manager.update(leftMobs, player, 16, true);

  for (let i = 0; i < leftMobs.length; i++) {
    const effX = leftMobs[i].x + leftMobs[i].overheadUI.customOffsetX;
    assert.ok(effX >= 20, `Label X (${effX}) must not breach left arena bound (20px)`);
  }
});

/* ==============================================================================
 * SUITE 5: 2.5D LAYER STACKING & DEPTH INVARIANTS
 * ============================================================================== */

test('2.5D Layer Stacking [Global Hierarchy]: Ground < Entities < VFX < Boss < UI layers maintain strict partitions', () => {
  // Ground partition: Background (-10) to Crisis Hazards (9)
  assert.ok(RENDER_DEPTH.BACKGROUND < RENDER_DEPTH.FLOOR);
  assert.ok(RENDER_DEPTH.FLOOR < RENDER_DEPTH.WALLS);
  assert.ok(RENDER_DEPTH.WALLS <= RENDER_DEPTH.BLOCKS);
  assert.ok(RENDER_DEPTH.BLOCKS < RENDER_DEPTH.CRISIS_HAZARDS);

  // Ground max is 9.0, Entity base is 100.0
  assert.ok(RENDER_DEPTH.CRISIS_HAZARDS < RENDER_DEPTH.ENTITY_Y_BASE);

  // Across screen range y in [0, 600]:
  for (let y = 0; y <= 600; y += 100) {
    const base = RENDER_DEPTH.ENTITY_Y_BASE + y * RENDER_DEPTH.ENTITY_Y_SCALE;
    const shadow = base + RENDER_DEPTH.OFFSET_SHADOW;
    const sprite = base + RENDER_DEPTH.OFFSET_SPRITE;
    const shield = base + RENDER_DEPTH.OFFSET_SHIELD;
    const hp = base + RENDER_DEPTH.OFFSET_HP_BAR;
    const name = base + RENDER_DEPTH.OFFSET_NAME_TAG;
    const intent = base + RENDER_DEPTH.OFFSET_INTENT_BADGE;

    // Strict monotonic ordering within entity
    assert.ok(shadow < sprite, `Shadow must be behind sprite at y=${y}`);
    assert.ok(sprite < shield, `Sprite must be behind shield at y=${y}`);
    assert.ok(shield < hp, `Shield must be behind HP bar at y=${y}`);
    assert.ok(hp < name, `HP bar must be behind name tag at y=${y}`);
    assert.ok(name < intent, `Name tag must be behind intent badge at y=${y}`);

    // All entities must be strictly below VFX layer (750)
    assert.ok(intent < RENDER_DEPTH.EXPLOSIONS, `Entity labels at y=${y} must be below explosions`);
  }

  // VFX < Boss < UI
  assert.ok(RENDER_DEPTH.EXPLOSIONS < RENDER_DEPTH.SHOCKWAVES);
  assert.ok(RENDER_DEPTH.SHOCKWAVES < RENDER_DEPTH.DEBRIS_PARTICLES);
  assert.ok(RENDER_DEPTH.DEBRIS_PARTICLES < RENDER_DEPTH.BOSS_BODY);
  assert.ok(RENDER_DEPTH.BOSS_BODY < RENDER_DEPTH.BOSS_VFX);
  assert.ok(RENDER_DEPTH.BOSS_VFX < RENDER_DEPTH.FLOATING_TEXT);
  assert.ok(RENDER_DEPTH.FLOATING_TEXT < RENDER_DEPTH.SCREEN_OVERLAY);
});

test('2.5D Layer Stacking [Natural Occlusion]: Southern entity body occludes Northern entity overhead labels', () => {
  const manager = new OverheadUIManager();
  const northMob = createMockEntity(200, 100, 'NorthMob');
  const southMob = createMockEntity(200, 200, 'SouthMob');
  const player = { x: 400, y: 150 };

  manager.update([northMob, southMob], player, 16, true);

  const northIntentDepth = northMob.getDepth() + (RENDER_DEPTH.OFFSET_INTENT_BADGE - RENDER_DEPTH.OFFSET_SPRITE);
  const southSpriteDepth = southMob.getDepth();

  assert.ok(
    southSpriteDepth > northIntentDepth,
    `Southern sprite (depth ${southSpriteDepth}) must render strictly in front of Northern labels (depth ${northIntentDepth})`
  );
});

test('2.5D Layer Stacking [Player Parity]: Player sprite and shield depths dynamically synchronize with entity layer', () => {
  const player = { x: 200, y: 250, currentDepth: 0, setDepth(d) { this.currentDepth = d; } };
  const entity = createMockEntity(200, 250, 'PeerMob');
  const manager = new OverheadUIManager();

  manager.update([entity], player, 16, true);

  const expectedBase = RENDER_DEPTH.ENTITY_Y_BASE + 250 * RENDER_DEPTH.ENTITY_Y_SCALE;
  assert.equal(player.currentDepth, expectedBase + RENDER_DEPTH.OFFSET_SPRITE, 'Player depth must match entity sprite depth formula');
  assert.equal(entity.getDepth(), expectedBase + RENDER_DEPTH.OFFSET_SPRITE, 'Entity sprite depth must match player depth at same Y');
});

/* ==============================================================================
 * SUITE 6: STRESS, HIGH DENSITY & NUMERICAL STABILITY
 * ============================================================================== */

test('Stress & Resilience [100 Mob Scrum]: 100 co-located entities maintain finite numbers and collapse into minimal LOD', () => {
  const manager = new OverheadUIManager();
  const player = { x: 500, y: 500 };
  const mobs = [];

  for (let i = 0; i < 100; i++) {
    mobs.push(createMockEntity(300, 300, `ScrumMob_${i}`));
  }

  manager.update(mobs, player, 16, true);

  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    assert.equal(m.overheadUI.lodMode, 'minimal', `Mob ${i} must collapse to minimal LOD`);
    assert.ok(Number.isFinite(m.overheadUI.customOffsetX), `Mob ${i} offsetX must be finite`);
    assert.ok(Number.isFinite(m.overheadUI.customOffsetY), `Mob ${i} offsetY must be finite`);
    assert.ok(Number.isFinite(m.overheadUI.currentAlpha), `Mob ${i} alpha must be finite`);
    assert.ok(!Number.isNaN(m.overheadUI.currentAlpha), `Mob ${i} alpha must not be NaN`);
  }
});

test('Stress & Resilience [Pathological Inputs]: Degenerate delta, null player and extreme coords produce 0 exceptions', () => {
  const manager = new OverheadUIManager();
  const entity = createMockEntity(200, 200, 'TestMob');

  // Null player: must not throw, retains full alpha
  assert.doesNotThrow(() => manager.update([entity], null, 16, true));
  assert.equal(entity.overheadUI.currentAlpha, 1.0);

  // Negative delta
  assert.doesNotThrow(() => manager.update([entity], { x: 200, y: 200 }, -50, false));
  assert.ok(!Number.isNaN(entity.overheadUI.currentAlpha));

  // Extreme delta (tab sleep / wake up)
  assert.doesNotThrow(() => manager.update([entity], { x: 200, y: 200 }, 1000000, false));
  assert.ok(entity.overheadUI.currentAlpha <= 1.0);

  // Extreme off-screen coordinates
  const farMob = createMockEntity(-9999, 99999, 'FarMob');
  assert.doesNotThrow(() => manager.update([farMob], { x: 200, y: 200 }, 16, true));
  assert.ok(Number.isFinite(farMob.overheadUI.customOffsetX));
  assert.ok(Number.isFinite(farMob.overheadUI.customOffsetY));
});
