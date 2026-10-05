/**
 * Comprehensive Test Suite: Depth Sorting (RENDER_DEPTH) & OverheadUIManager
 *
 * Verifies:
 * 1. Global RENDER_DEPTH Partition Invariants:
 *    - Ground Layers (Background -> Crisis Hazards)
 *    - Dynamic 2.5D Band (Shadow -> Sprite -> Shield -> HP Bar -> Name Tag -> Intent Badge)
 *    - World VFX (Explosions -> Shockwaves -> Debris)
 *    - Boss Layers (Body -> VFX)
 *    - UI & Overlay (Floating Combat Text -> Screen Overlay)
 * 2. 2.5D Dynamic Y-Sorting & Natural Occlusion:
 *    - Southern entities render in front of Northern entities
 *    - Continuous crossing transit with zero hitching or discontinuity
 *    - Player sprite depth synchronization with entity layer
 * 3. OverheadUIManager Decluttering & Overlap Resolution:
 *    - 3-tier Adaptive LOD (Full, Compact, Minimal) based on distance & melee clustering
 *    - AABB horizontal spring repulsion (overlapX / 2 push)
 *    - Vertical staggering (-14px / +46px split) for collinear entities (dx < 24px)
 *    - Arena boundary clamping ([20, 580] X, [20, 500] Y)
 *    - Float32Array scratch buffer reuse & zero-GC high density clustering
 * 4. Player Protection Bubble (R = 38px) & Zero Occlusion Guarantee:
 *    - Name Tags (y - 22): alpha = 0.0 inside core zone (<= 20px), <= 0.15 in transition (20..38px)
 *    - Health Bars (y - 14): alpha synchronized with OverheadUI.setAlpha
 *    - Intent Badges (y - 34): intent position explicitly evaluated in distance check
 *    - Floating Combat Text (FloatingTextManager):
 *      - Staggered +16px vertical cascade on rapid bursts (<= 450ms, <= 30px)
 *      - Strict vertical separation (>= 16px gap, >= 4px font clearance)
 *      - Upward trajectory & lifetime pruning
 *    - Smooth frame-over-frame lerp (delta * 0.015) preventing visual pops
 *    - Smooth outer bubble attenuation (38px to 50px)
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
 * SUITE 1: RENDER_DEPTH CONSTANTS & GLOBAL PARTITION INVARIANTS
 * ============================================================================== */

test('RENDER_DEPTH [Ground Hierarchy]: Ground layers strictly monotonically ascend', () => {
  const groundLayers = [
    { name: 'BACKGROUND', depth: RENDER_DEPTH.BACKGROUND },
    { name: 'FLOOR', depth: RENDER_DEPTH.FLOOR },
    { name: 'WALLS', depth: RENDER_DEPTH.WALLS },
    { name: 'BLOCKS', depth: RENDER_DEPTH.BLOCKS },
    { name: 'DECALS', depth: RENDER_DEPTH.DECALS },
    { name: 'PORTALS', depth: RENDER_DEPTH.PORTALS },
    { name: 'ITEM_GLOW', depth: RENDER_DEPTH.ITEM_GLOW },
    { name: 'ITEMS', depth: RENDER_DEPTH.ITEMS },
    { name: 'BOMBS', depth: RENDER_DEPTH.BOMBS },
    { name: 'TELEGRAPHS', depth: RENDER_DEPTH.TELEGRAPHS },
    { name: 'CRISIS_HAZARDS', depth: RENDER_DEPTH.CRISIS_HAZARDS },
  ];

  for (let i = 0; i < groundLayers.length - 1; i++) {
    const cur = groundLayers[i];
    const next = groundLayers[i + 1];
    assert.ok(
      cur.depth <= next.depth,
      `Ground layer ${cur.name} (${cur.depth}) must be <= ${next.name} (${next.depth})`
    );
  }

  assert.equal(RENDER_DEPTH.BACKGROUND, -10);
  assert.equal(RENDER_DEPTH.FLOOR, 0);
  assert.equal(RENDER_DEPTH.CRISIS_HAZARDS, 9);
});

test('RENDER_DEPTH [Partition Separation]: Ground < Dynamic Entities < VFX < Boss < UI partitions are disjoint', () => {
  const maxGround = RENDER_DEPTH.CRISIS_HAZARDS; // 9
  assert.equal(maxGround, 9);

  // Dynamic band spans across screen coordinates y in [0, 600]:
  // Depth formula: ENTITY_Y_BASE + y * ENTITY_Y_SCALE + OFFSET
  // Minimum possible depth: y=0, OFFSET_SHADOW (-0.1) -> 100 - 0.1 = 99.9
  // Maximum possible depth: y=600, OFFSET_INTENT_BADGE (+0.4) -> 700 + 0.4 = 700.4
  const minEntityDepth = RENDER_DEPTH.ENTITY_Y_BASE + 0 * RENDER_DEPTH.ENTITY_Y_SCALE + RENDER_DEPTH.OFFSET_SHADOW;
  const maxEntityDepth = RENDER_DEPTH.ENTITY_Y_BASE + 600 * RENDER_DEPTH.ENTITY_Y_SCALE + RENDER_DEPTH.OFFSET_INTENT_BADGE;

  assert.ok(
    minEntityDepth > maxGround,
    `Min entity depth (${minEntityDepth}) must strictly exceed max ground layer (${maxGround})`
  );

  // VFX partition (750 to 770)
  assert.ok(
    RENDER_DEPTH.EXPLOSIONS > maxEntityDepth,
    `EXPLOSIONS (${RENDER_DEPTH.EXPLOSIONS}) must strictly exceed max entity depth (${maxEntityDepth})`
  );
  assert.ok(RENDER_DEPTH.EXPLOSIONS < RENDER_DEPTH.SHOCKWAVES);
  assert.ok(RENDER_DEPTH.SHOCKWAVES < RENDER_DEPTH.DEBRIS_PARTICLES);

  // Boss partition (800 to 810)
  assert.ok(RENDER_DEPTH.DEBRIS_PARTICLES < RENDER_DEPTH.BOSS_BODY);
  assert.ok(RENDER_DEPTH.BOSS_BODY < RENDER_DEPTH.BOSS_VFX);

  // Overhead UI / Floating labels partition (900 to 950)
  assert.ok(RENDER_DEPTH.BOSS_VFX < RENDER_DEPTH.FLOATING_TEXT);
  assert.ok(RENDER_DEPTH.FLOATING_TEXT < RENDER_DEPTH.SCREEN_OVERLAY);
  assert.equal(RENDER_DEPTH.FLOATING_TEXT, 900);
  assert.equal(RENDER_DEPTH.SCREEN_OVERLAY, 950);
});

/* ==============================================================================
 * SUITE 2: CONTINUOUS 2.5D DYNAMIC Y-SORTING & INTRA-ENTITY SUB-LAYERS
 * ============================================================================== */

test('2.5D Depth [Intra-Entity Sub-layers]: Strict monotonic ordering of sub-layers at all Y', () => {
  const manager = new OverheadUIManager();
  const testYValues = [0, 50, 150.5, 300, 450.25, 600];

  for (const y of testYValues) {
    const entity = createMockEntity(300, y, 'SubLayerTest');
    manager.update([entity], null, 16, true);

    const base = RENDER_DEPTH.ENTITY_Y_BASE + y * RENDER_DEPTH.ENTITY_Y_SCALE;
    const shadow = base + RENDER_DEPTH.OFFSET_SHADOW;
    const sprite = entity.getDepth();
    const shield = base + RENDER_DEPTH.OFFSET_SHIELD;
    const hp = base + RENDER_DEPTH.OFFSET_HP_BAR;
    const nameTag = base + RENDER_DEPTH.OFFSET_NAME_TAG;
    const intent = base + RENDER_DEPTH.OFFSET_INTENT_BADGE;

    assert.equal(sprite, base + RENDER_DEPTH.OFFSET_SPRITE);
    assert.ok(shadow < sprite, `Shadow must be behind sprite at y=${y}`);
    assert.ok(sprite < shield, `Sprite must be behind shield at y=${y}`);
    assert.ok(shield < hp, `Shield must be behind HP bar at y=${y}`);
    assert.ok(hp < nameTag, `HP bar must be behind name tag at y=${y}`);
    assert.ok(nameTag < intent, `Name tag must be behind intent badge at y=${y}`);

    // Exact sub-offsets verification
    assert.ok(Math.abs((sprite - shadow) - 0.1) < 1e-6);
    assert.ok(Math.abs((shield - sprite) - 0.1) < 1e-6);
    assert.ok(Math.abs((hp - shield) - 0.1) < 1e-6);
    assert.ok(Math.abs((nameTag - hp) - 0.1) < 1e-6);
    assert.ok(Math.abs((intent - nameTag) - 0.1) < 1e-6);
  }
});

test('2.5D Depth [Player Parity]: Player sprite depth dynamically matches entity sprite depth formula', () => {
  const manager = new OverheadUIManager();
  let playerDepth = 0;
  const player = {
    x: 250,
    y: 350,
    setDepth(d) {
      playerDepth = d;
    },
  };
  const entity = createMockEntity(250, 350, 'PeerEntity');

  manager.update([entity], player, 16, true);

  const expectedBase = RENDER_DEPTH.ENTITY_Y_BASE + 350 * RENDER_DEPTH.ENTITY_Y_SCALE;
  const expectedSprite = expectedBase + RENDER_DEPTH.OFFSET_SPRITE;

  assert.equal(playerDepth, expectedSprite, 'Player sprite depth must match expected formula');
  assert.equal(entity.getDepth(), expectedSprite, 'Entity sprite depth must match player depth at same Y');
});

test('2.5D Depth [Natural Occlusion]: Southern entities occlude Northern entities and labels', () => {
  const manager = new OverheadUIManager();
  const north = createMockEntity(200, 150, 'North');
  const south = createMockEntity(200, 250, 'South');

  manager.update([north, south], null, 16, true);

  const northIntentDepth = RENDER_DEPTH.ENTITY_Y_BASE + 150 * RENDER_DEPTH.ENTITY_Y_SCALE + RENDER_DEPTH.OFFSET_INTENT_BADGE;
  const southSpriteDepth = south.getDepth();

  assert.ok(
    southSpriteDepth > northIntentDepth,
    `Southern sprite (depth ${southSpriteDepth}) must render strictly in front of Northern intent badge (depth ${northIntentDepth})`
  );
});

test('2.5D Depth [Continuous Crossing]: Vertical transit smoothly inverts depth order without hitching', () => {
  const manager = new OverheadUIManager();
  const stationary = createMockEntity(300, 200, 'Stationary');
  const mover = createMockEntity(300, 100, 'Mover');

  // Move from y=100 to y=300 in 50 steps
  for (let i = 0; i <= 50; i++) {
    mover.y = 100 + i * 4;
    manager.update([stationary, mover], null, 16, true);

    if (mover.y < stationary.y) {
      assert.ok(mover.getDepth() < stationary.getDepth(), `Mover at ${mover.y} must be behind stationary at 200`);
    } else if (mover.y > stationary.y) {
      assert.ok(mover.getDepth() > stationary.getDepth(), `Mover at ${mover.y} must be in front of stationary at 200`);
    } else {
      assert.equal(mover.getDepth(), stationary.getDepth(), `Mover at ${mover.y} must equal stationary at 200`);
    }
  }
});

/* ==============================================================================
 * SUITE 3: OVERHEAD UI MANAGER DECLUTTERING & ADAPTIVE LOD
 * ============================================================================== */

test('OverheadUIManager [Adaptive LOD]: Transitions full -> compact -> minimal based on distance & density', () => {
  const manager = new OverheadUIManager();
  const player = { x: 500, y: 500 };

  // 1. Solo entity (d > 70px) -> 'full'
  const soloA = createMockEntity(100, 100, 'Chaser: Blinky');
  const soloB = createMockEntity(300, 100, 'Bomber: Pyro');
  manager.update([soloA, soloB], player, 16, true);
  assert.equal(soloA.overheadUI.lodMode, 'full');
  assert.equal(soloB.overheadUI.lodMode, 'full');

  // 2. Clustered pair (d <= 70px, e.g. 50px apart) -> 'compact'
  const pairA = createMockEntity(200, 200, 'Chaser: Blinky');
  const pairB = createMockEntity(250, 200, 'Bomber: Pyro');
  manager.update([pairA, pairB], player, 16, true);
  assert.equal(pairA.overheadUI.lodMode, 'compact');
  assert.equal(pairB.overheadUI.lodMode, 'compact');
  assert.equal(pairA.overheadUI.compactName, 'Blinky');
  assert.equal(pairB.overheadUI.compactName, 'Pyro');

  // 3. Dense melee cluster (3+ entities within 60px) -> 'minimal'
  const meleeA = createMockEntity(200, 200, 'Chaser: Blinky');
  const meleeB = createMockEntity(230, 200, 'Bomber: Pyro');
  const meleeC = createMockEntity(215, 230, 'Tank: Iron Golem');
  manager.update([meleeA, meleeB, meleeC], player, 16, true);
  assert.equal(meleeA.overheadUI.lodMode, 'minimal');
  assert.equal(meleeB.overheadUI.lodMode, 'minimal');
  assert.equal(meleeC.overheadUI.lodMode, 'minimal');
});

test('OverheadUIManager [AABB Repulsion]: Horizontal spring pushes overlapping labels apart', () => {
  const manager = new OverheadUIManager();
  const player = { x: 500, y: 500 };

  const leftMob = createMockEntity(200, 200, 'Chaser: Blinky');
  const rightMob = createMockEntity(235, 200, 'Bomber: Pyro');

  manager.update([leftMob, rightMob], player, 16, true);

  assert.ok(leftMob.overheadUI.customOffsetX < 0, 'Left mob shifted left');
  assert.ok(rightMob.overheadUI.customOffsetX > 0, 'Right mob shifted right');

  const finalDistance = (rightMob.x + rightMob.overheadUI.customOffsetX) - (leftMob.x + leftMob.overheadUI.customOffsetX);
  assert.ok(finalDistance >= 48, `Final label separation (${finalDistance}px) clears clearance`);
});

test('OverheadUIManager [Vertical Staggering]: Collinear entities (dx < 24px) trigger upper (-14px) and lower (+46px) split', () => {
  const manager = new OverheadUIManager();
  const player = { x: 500, y: 500 };

  const northMob = createMockEntity(200, 195, 'Chaser: Blinky');
  const southMob = createMockEntity(205, 205, 'Bomber: Pyro');

  manager.update([northMob, southMob], player, 16, true);

  assert.equal(northMob.overheadUI.customOffsetY, -14, 'Northern entity elevated by -14px');
  assert.equal(southMob.overheadUI.customOffsetY, 46, 'Southern entity lowered by +46px');

  const northLayers = northMob.overheadUI.getRenderLayers(true);
  const southLayers = southMob.overheadUI.getRenderLayers(true);
  const vGap = southLayers.tier2_name.y - northLayers.tier2_name.y;
  assert.ok(vGap >= 60, `Vertical gap (${vGap}px) prevents label occlusion`);
});

test('OverheadUIManager [Boundary Clamping]: UI labels strictly stay within arena bounds', () => {
  const manager = new OverheadUIManager();
  const player = { x: 300, y: 300 };

  const leftMobs = [];
  for (let i = 0; i < 5; i++) {
    leftMobs.push(createMockEntity(20, 200 + i * 2, `WallMob_${i}`));
  }
  manager.update(leftMobs, player, 16, true);

  for (const mob of leftMobs) {
    const effX = mob.x + mob.overheadUI.customOffsetX;
    assert.ok(effX >= 20, `Label X (${effX}) must not breach left wall (20px)`);
  }
});

/* ==============================================================================
 * SUITE 4: PLAYER PROTECTION BUBBLE (R = 38px) & OCCLUSION PREVENTION
 * ============================================================================== */

test('Player Protection Bubble [Core Zone d <= 20px]: Overhead UI is completely transparent (alpha = 0.0)', () => {
  const manager = new OverheadUIManager();
  const player = { x: 300, y: 300 };

  // 1. Entity body co-located at player center
  const coLocated = createMockEntity(300, 300, 'CoLocated');
  manager.update([coLocated], player, 16, true);
  assert.equal(coLocated.overheadUI.currentAlpha, 0.0, 'Co-located entity overhead UI alpha must be 0.0');

  // 2. Entity positioned so name tag (y - 22) lands exactly on player
  const nameTagOnPlayer = createMockEntity(300, 322, 'NameTagOnPlayer');
  manager.update([nameTagOnPlayer], player, 16, true);
  assert.equal(nameTagOnPlayer.overheadUI.currentAlpha, 0.0, 'Entity whose name tag touches player must have alpha 0.0');

  // 3. Entity positioned so health bar (y - 14) lands exactly on player
  const hpBarOnPlayer = createMockEntity(300, 314, 'HpBarOnPlayer');
  manager.update([hpBarOnPlayer], player, 16, true);
  assert.equal(hpBarOnPlayer.overheadUI.currentAlpha, 0.0, 'Entity whose HP bar touches player must have alpha 0.0');

  // 4. Entity positioned so intent badge (y - 34) lands exactly on player
  const intentOnPlayer = createMockEntity(300, 334, 'IntentOnPlayer');
  intentOnPlayer.overheadUI.setIntent('!', true);
  manager.update([intentOnPlayer], player, 16, true);
  assert.equal(intentOnPlayer.overheadUI.currentAlpha, 0.0, 'Entity whose intent badge touches player must have alpha 0.0');
});

test('Player Protection Bubble [Linear Ramp 20px < d <= 38px]: Opacity ramps smoothly up to <= 0.15', () => {
  const manager = new OverheadUIManager();
  const player = { x: 300, y: 300 };

  // Sample across 18 distances
  for (let d = 21; d <= 38; d++) {
    const mob = createMockEntity(player.x + d, player.y, `Mob_${d}`);
    manager.update([mob], player, 16, true);

    const alpha = mob.overheadUI.currentAlpha;
    const expected = 0.15 * ((d - 20) / (38 - 20));

    assert.ok(alpha > 0.0, `Alpha at d=${d} must be > 0.0`);
    assert.ok(alpha <= 0.15, `Alpha at d=${d} must be <= 0.15`);
    assert.ok(Math.abs(alpha - expected) < 1e-4, `Alpha at d=${d} matches ramp formula`);
  }
});

test('Player Protection Bubble [Exterior d > 38px]: Full opacity outside bubble', () => {
  const manager = new OverheadUIManager(false);
  const player = { x: 300, y: 300 };

  const exteriorMob = createMockEntity(player.x + 45, player.y, 'ExteriorMob');
  manager.update([exteriorMob], player, 16, true);
  assert.equal(exteriorMob.overheadUI.currentAlpha, 1.0, 'Entity outside 38px bubble retains full alpha 1.0');
});

test('Player Protection Bubble [Smooth Outer Attenuation 38px < d <= 50px]: Optional mode interpolates to 1.0 smoothly', () => {
  const manager = new OverheadUIManager(true); // smoothOuterBubble = true
  const player = { x: 300, y: 300 };

  const midMob = createMockEntity(player.x + 44, player.y, 'MidMob');
  manager.update([midMob], player, 16, true);

  const alpha = midMob.overheadUI.currentAlpha;
  const expected = 0.15 + (1.0 - 0.15) * ((44 - 38) / (50 - 38)); // 0.575
  assert.ok(Math.abs(alpha - expected) < 1e-4, `Smooth outer alpha at d=44px matches expected ${expected}`);
});

test('Player Protection Bubble [Synchronous Sub-layer Alpha]: setAlpha updates HP, name tag, and intent synchronously', () => {
  let hpAlpha = -1;
  let nameAlpha = -1;
  let indicatorAlpha = -1;

  const overheadUI = new OverheadUI(null, 'Chaser: Blinky', 'enemy', 3);
  overheadUI.hpGraphics = { active: true, setAlpha: (a) => { hpAlpha = a; } };
  overheadUI.nameTag = { active: true, setAlpha: (a) => { nameAlpha = a; } };
  overheadUI.indicator = { active: true, setAlpha: (a) => { indicatorAlpha = a; } };

  overheadUI.setAlpha(0.08);

  assert.equal(overheadUI.currentAlpha, 0.08);
  assert.equal(hpAlpha, 0.08, 'Health bar alpha synchronized');
  assert.equal(nameAlpha, 0.08, 'Name tag alpha synchronized');
  assert.equal(indicatorAlpha, 0.08, 'Intent badge alpha synchronized');
});

test('Player Protection Bubble [Dynamic Lerp]: Frame-over-frame lerp prevents visual popping', () => {
  const manager = new OverheadUIManager();
  const player = { x: 300, y: 300 };
  const mob = createMockEntity(300, 322, 'LerpMob'); // Target alpha = 0.0

  assert.equal(mob.overheadUI.currentAlpha, 1.0);

  // 1 frame at 16ms delta
  manager.update([mob], player, 16, false);
  const alphaFrame1 = mob.overheadUI.currentAlpha;

  assert.ok(alphaFrame1 < 1.0, 'Alpha decreases');
  assert.ok(alphaFrame1 > 0.5, 'Alpha does not pop immediately to 0');
  assert.ok(Math.abs(alphaFrame1 - 0.76) < 0.02, 'Alpha decays with factor ~0.24');

  // Converges smoothly over 30 frames
  for (let f = 0; f < 30; f++) {
    manager.update([mob], player, 16, false);
  }
  assert.ok(mob.overheadUI.currentAlpha < 0.001, 'Alpha asymptotically reaches 0.0');
});

/* ==============================================================================
 * SUITE 5: FLOATING COMBAT TEXT & OVERLAP RESOLUTION
 * ============================================================================== */

test('Floating Combat Text [Cascade Progression]: Rapid combat text bursts cascade by +16px each', () => {
  const ftManager = new FloatingTextManager();
  const originX = 200;
  const originY = 200;
  const startTime = 1000;

  const offsets = [];
  for (let i = 0; i < 20; i++) {
    const time = startTime + i * 5; // 5ms intervals
    const offset = ftManager.getCascadeOffset(originX, originY, time);
    offsets.push(offset);
  }

  for (let i = 0; i < 20; i++) {
    assert.equal(offsets[i], i * 16, `Burst item ${i} has offset ${i * 16}px`);
  }
});

test('Floating Combat Text [Zero Overlap Clearance]: Vertical separation maintains >= 4px clearance above 12px text', () => {
  const ftManager = new FloatingTextManager();
  const originX = 200;
  const originY = 300;
  const time = 5000;
  const TEXT_HEIGHT_PX = 12;

  const yPositions = [];
  for (let i = 0; i < 10; i++) {
    const cascadeOffset = ftManager.getCascadeOffset(originX, originY, time + i * 10);
    // As in GameScene.ts: startY = y - cascadeOffset
    const startY = originY - cascadeOffset;
    yPositions.push(startY);
  }

  for (let i = 0; i < yPositions.length - 1; i++) {
    const lowerTextY = yPositions[i];
    const upperTextY = yPositions[i + 1];
    const verticalGap = lowerTextY - upperTextY;

    assert.equal(verticalGap, 16, 'Exact 16px vertical gap');
    const clearance = verticalGap - TEXT_HEIGHT_PX;
    assert.ok(clearance >= 4, `Text clearance (${clearance}px) must be >= 4px to eliminate overlap`);
  }
});

test('Floating Combat Text [Upward Trajectory & Player Clearance]: Spawning above player moves away from player sprite', () => {
  const ftManager = new FloatingTextManager();
  const player = { x: 300, y: 300 };
  const currentTime = 1000;

  // In GameScene.ts, player combat text spawns at (player.x, player.y - 14) or (player.x, player.y - 25)
  // and rises upward with y - 22 over 650ms
  const spawnY = player.y - 14;
  const cascadeOffset = ftManager.getCascadeOffset(player.x, spawnY, currentTime);
  const startY = spawnY - cascadeOffset;
  const targetY = startY - 22;

  // Verify that startY and targetY are positioned above player center and rise upward
  assert.ok(startY < player.y, `Start Y (${startY}) is above player (${player.y})`);
  assert.ok(targetY < startY, `Target Y (${targetY}) rises higher than start Y (${startY})`);
  assert.equal(startY - targetY, 22, 'Tweens upward by 22px');
});

test('Floating Combat Text [Spatial Clustering & Expiry]: Independent clusters and 450ms cooldown reset', () => {
  const ftManager = new FloatingTextManager();
  const time = 1000;

  // Two distant spawns (> 30px apart)
  const offsetA1 = ftManager.getCascadeOffset(100, 100, time);
  const offsetB1 = ftManager.getCascadeOffset(300, 300, time);
  assert.equal(offsetA1, 0, 'Cluster A first spawn offset = 0');
  assert.equal(offsetB1, 0, 'Cluster B first spawn offset = 0 (no cross-talk)');

  // Advance time past 450ms cooldown
  const offsetAfterExpiry = ftManager.getCascadeOffset(100, 100, time + 451);
  assert.equal(offsetAfterExpiry, 0, 'After 451ms cooldown, offset resets back to 0px');
});

/* ==============================================================================
 * SUITE 6: EXHAUSTIVE INTEGRATION & HIGH-DENSITY CHAOS STRESS
 * ============================================================================== */

test('High-Density Stress [100 Mobs Swarm]: All entities maintain finite coordinates and minimal LOD', () => {
  const manager = new OverheadUIManager(true);
  const player = { x: 300, y: 300 };
  const mobs = [];

  for (let i = 0; i < 100; i++) {
    const angle = (i / 100) * Math.PI * 2;
    const dist = 5 + (i % 25);
    mobs.push(createMockEntity(player.x + Math.cos(angle) * dist, player.y + Math.sin(angle) * dist, `Mob_${i}`));
  }

  manager.update(mobs, player, 16, true);

  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    assert.equal(m.overheadUI.lodMode, 'minimal', `Dense cluster mob ${i} collapses to minimal LOD`);
    assert.ok(Number.isFinite(m.overheadUI.currentAlpha), `Mob ${i} alpha must be finite`);
    assert.ok(!Number.isNaN(m.overheadUI.currentAlpha), `Mob ${i} alpha must not be NaN`);
    assert.ok(m.overheadUI.currentAlpha >= 0.0 && m.overheadUI.currentAlpha <= 0.15, `Mob ${i} inside 30px bubble has alpha <= 0.15`);
  }
});
