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

const {
  ROWS,
  COLS,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  FlatHazardMask,
  isTileInHazardMask,
  cloneBombTilesAsSet,
  getSafeDemolitionApproaches,
} = await import('../src/game/pathfinding.ts');

/* ==============================================================================
 * MOCK HELPERS FOR TESTING
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

function createStandardMap() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0)) {
        map[r][c] = TILE_WALL;
      } else {
        map[r][c] = TILE_EMPTY;
      }
    }
  }
  return map;
}

/* ==============================================================================
 * TIER 1: RENDER_DEPTH HIERARCHY SPECIFICATION
 * ============================================================================== */

test('Tier 1 [RENDER_DEPTH]: Ground layers maintain strictly increasing ordering', () => {
  assert.ok(RENDER_DEPTH.BACKGROUND < RENDER_DEPTH.FLOOR);
  assert.ok(RENDER_DEPTH.FLOOR < RENDER_DEPTH.WALLS);
  assert.ok(RENDER_DEPTH.WALLS <= RENDER_DEPTH.BLOCKS);
  assert.ok(RENDER_DEPTH.BLOCKS < RENDER_DEPTH.DECALS);
  assert.ok(RENDER_DEPTH.DECALS < RENDER_DEPTH.PORTALS);
  assert.ok(RENDER_DEPTH.PORTALS < RENDER_DEPTH.ITEM_GLOW);
  assert.ok(RENDER_DEPTH.ITEM_GLOW < RENDER_DEPTH.ITEMS);
  assert.ok(RENDER_DEPTH.ITEMS < RENDER_DEPTH.BOMBS);
  assert.ok(RENDER_DEPTH.BOMBS < RENDER_DEPTH.TELEGRAPHS);
  assert.ok(RENDER_DEPTH.TELEGRAPHS < RENDER_DEPTH.CRISIS_HAZARDS);
});

test('Tier 1 [RENDER_DEPTH]: Dynamic 2.5D entity band is strictly above ground and below VFX/Boss', () => {
  assert.ok(RENDER_DEPTH.CRISIS_HAZARDS < RENDER_DEPTH.ENTITY_Y_BASE);

  // Across any screen coordinate y in [0, 600]:
  for (let y = 0; y <= 600; y += 50) {
    const baseDepth = RENDER_DEPTH.ENTITY_Y_BASE + y * RENDER_DEPTH.ENTITY_Y_SCALE;
    const shadowDepth = baseDepth + RENDER_DEPTH.OFFSET_SHADOW;
    const spriteDepth = baseDepth + RENDER_DEPTH.OFFSET_SPRITE;
    const hpDepth = baseDepth + RENDER_DEPTH.OFFSET_HP_BAR;
    const nameDepth = baseDepth + RENDER_DEPTH.OFFSET_NAME_TAG;
    const intentDepth = baseDepth + RENDER_DEPTH.OFFSET_INTENT_BADGE;

    assert.ok(shadowDepth < spriteDepth, `Shadow must be behind sprite at y=${y}`);
    assert.ok(spriteDepth < hpDepth, `Sprite must be below HP bar at y=${y}`);
    assert.ok(hpDepth < nameDepth, `HP bar must be below Name tag at y=${y}`);
    assert.ok(nameDepth < intentDepth, `Name tag must be below Intent badge at y=${y}`);

    assert.ok(intentDepth < RENDER_DEPTH.EXPLOSIONS, `Entity labels must be below explosions at y=${y}`);
  }

  assert.ok(RENDER_DEPTH.EXPLOSIONS < RENDER_DEPTH.SHOCKWAVES);
  assert.ok(RENDER_DEPTH.SHOCKWAVES < RENDER_DEPTH.DEBRIS_PARTICLES);
  assert.ok(RENDER_DEPTH.DEBRIS_PARTICLES < RENDER_DEPTH.BOSS_BODY);
  assert.ok(RENDER_DEPTH.BOSS_BODY < RENDER_DEPTH.BOSS_VFX);
  assert.ok(RENDER_DEPTH.BOSS_VFX < RENDER_DEPTH.FLOATING_TEXT);
  assert.ok(RENDER_DEPTH.FLOATING_TEXT < RENDER_DEPTH.SCREEN_OVERLAY);
});

/* ==============================================================================
 * TIER 2: DYNAMIC CONTINUOUS 2.5D Y-SORTING
 * ============================================================================== */

test('Tier 2 [Dynamic Y-Sorting]: Southern entities sort above Northern entities and labels', () => {
  const manager = new OverheadUIManager();
  const northEntity = createMockEntity(200, 100, 'Chaser: North');
  const southEntity = createMockEntity(200, 250, 'Chaser: South');
  const player = { x: 400, y: 180, setDepth() {} };

  manager.update([northEntity, southEntity], player, 16, true);

  const northBase = RENDER_DEPTH.ENTITY_Y_BASE + northEntity.y * RENDER_DEPTH.ENTITY_Y_SCALE;
  const southBase = RENDER_DEPTH.ENTITY_Y_BASE + southEntity.y * RENDER_DEPTH.ENTITY_Y_SCALE;

  assert.equal(northEntity.getDepth(), northBase + RENDER_DEPTH.OFFSET_SPRITE);
  assert.equal(southEntity.getDepth(), southBase + RENDER_DEPTH.OFFSET_SPRITE);

  // South sprite must render strictly above North entity's overhead labels (2.5D natural occlusion)
  const northIntentDepth = northBase + RENDER_DEPTH.OFFSET_INTENT_BADGE;
  const southSpriteDepth = southBase + RENDER_DEPTH.OFFSET_SPRITE;
  assert.ok(
    southSpriteDepth > northIntentDepth,
    `Southern entity at y=250 (depth ${southSpriteDepth}) must render in front of Northern labels at y=100 (depth ${northIntentDepth})`
  );
});

/* ==============================================================================
 * TIER 3: OVERHEAD UI MANAGER ADAPTIVE LOD
 * ============================================================================== */

test('Tier 3 [Adaptive LOD]: Solo entity renders full name when distance > 70px', () => {
  const manager = new OverheadUIManager();
  const entityA = createMockEntity(100, 100, 'Chaser: Blinky');
  const entityB = createMockEntity(300, 300, 'Bomber: Kaboom');
  const player = { x: 500, y: 500 };

  manager.update([entityA, entityB], player, 16, true);

  assert.equal(entityA.overheadUI.lodMode, 'full');
  assert.equal(entityB.overheadUI.lodMode, 'full');
});

test('Tier 3 [Adaptive LOD]: Clustered pair renders compact nickname when distance <= 70px', () => {
  const manager = new OverheadUIManager();
  const entityA = createMockEntity(200, 200, 'Chaser: Blinky');
  const entityB = createMockEntity(245, 200, 'Bomber: Kaboom'); // distance = 45px <= 70px
  const player = { x: 500, y: 500 };

  manager.update([entityA, entityB], player, 16, true);

  assert.equal(entityA.overheadUI.lodMode, 'compact');
  assert.equal(entityB.overheadUI.lodMode, 'compact');
  assert.equal(entityA.overheadUI.compactName, 'Blinky');
  assert.equal(entityB.overheadUI.compactName, 'Kaboom');
});

test('Tier 3 [Adaptive LOD]: Dense melee cluster (3+ within 60px) sets minimal mode', () => {
  const manager = new OverheadUIManager();
  const entityA = createMockEntity(200, 200, 'Chaser: Blinky');
  const entityB = createMockEntity(230, 210, 'Bomber: Kaboom');
  const entityC = createMockEntity(215, 240, 'Tank: Iron Golem');
  const player = { x: 500, y: 500 };

  manager.update([entityA, entityB, entityC], player, 16, true);

  assert.equal(entityA.overheadUI.lodMode, 'minimal');
  assert.equal(entityB.overheadUI.lodMode, 'minimal');
  assert.equal(entityC.overheadUI.lodMode, 'minimal');
});

test('Tier 3 [Adaptive LOD]: Player proximity triggers compact and melee LOD', () => {
  const manager = new OverheadUIManager();
  const entity = createMockEntity(100, 100, 'Chaser: Blinky');
  const playerClose = { x: 140, y: 100 }; // 40px away from entity

  manager.update([entity], playerClose, 16, true);
  assert.equal(entity.overheadUI.lodMode, 'compact', 'Entity near player must be compact');
});

/* ==============================================================================
 * TIER 4: AABB COLLISION DETECTION & HORIZONTAL / VERTICAL DECLUTTERING
 * ============================================================================== */

test('Tier 4 [AABB Repulsion]: Horizontal spring repulsion pushes overlapping labels apart', () => {
  const manager = new OverheadUIManager();
  // Two entities at dx = 35px (overlap detected since requiredW ~ 48px), dy = 0px
  const eA = createMockEntity(200, 200, 'Chaser: Blinky');
  const eB = createMockEntity(235, 200, 'Bomber: Kaboom');
  const player = { x: 500, y: 500 };

  manager.update([eA, eB], player, 16, true);

  // Both are in compact mode (width = 44px, requiredW = 48px)
  // dx = 35px >= 24px -> horizontal spring repulsion applies
  assert.ok(eA.overheadUI.customOffsetX < 0, 'Left entity must be nudged left');
  assert.ok(eB.overheadUI.customOffsetX > 0, 'Right entity must be nudged right');

  const effectiveDistanceX = (eB.x + eB.overheadUI.customOffsetX) - (eA.x + eA.overheadUI.customOffsetX);
  assert.ok(effectiveDistanceX >= 48, `Effective separation ${effectiveDistanceX}px must clear requiredW`);
});

test('Tier 4 [Vertical Staggering]: Tight horizontal alignment (dx < 24px) triggers upper/lower split', () => {
  const manager = new OverheadUIManager();
  // Two entities in same vertical column: dx = 5px, dy = 10px
  const north = createMockEntity(200, 195, 'Chaser: Blinky');
  const south = createMockEntity(205, 205, 'Bomber: Kaboom');
  const player = { x: 500, y: 500 };

  manager.update([north, south], player, 16, true);

  assert.equal(north.overheadUI.customOffsetY, -14, 'Northern entity gets elevated tier (-14px)');
  assert.equal(south.overheadUI.customOffsetY, 46, 'Southern entity gets under-foot tier (+46px)');

  const northLayers = north.overheadUI.getRenderLayers(true);
  const southLayers = south.overheadUI.getRenderLayers(true);
  const verticalGap = southLayers.tier2_name.y - northLayers.tier2_name.y;
  assert.ok(verticalGap >= 60, `Vertical gap ${verticalGap}px must prevent text collision`);
});

test('Tier 4 [Boundary Clamping]: Repulsion strictly clamps labels within arena bounds [20, 580]', () => {
  const manager = new OverheadUIManager();
  // Entities hugging the left wall (x = 25px and x = 45px)
  const eLeft = createMockEntity(25, 200, 'Chaser: Blinky');
  const eRight = createMockEntity(45, 200, 'Bomber: Kaboom');
  const player = { x: 500, y: 500 };

  manager.update([eLeft, eRight], player, 16, true);

  const clampedX = eLeft.x + eLeft.overheadUI.customOffsetX;
  assert.ok(clampedX >= 20, `Label center X (${clampedX}) must not clip outside left arena bound (20px)`);
});

/* ==============================================================================
 * TIER 5: PLAYER SPRITE PROTECTION BUBBLE (R = 38px)
 * ============================================================================== */

test('Tier 5 [Player Bubble]: Entity label inside R <= 20px decays to alpha 0.0', () => {
  const manager = new OverheadUIManager();
  const entity = createMockEntity(200, 222, 'Chaser: Blinky'); // label center is at (200, 200)
  const player = { x: 200, y: 200 }; // exact overlap with label

  manager.update([entity], player, 16, true);

  assert.equal(entity.overheadUI.currentAlpha, 0.0, 'Label overlapping player sprite must be completely transparent');
});

test('Tier 5 [Player Bubble]: Entity label between 20px and 38px smoothly ramps alpha <= 0.15', () => {
  const manager = new OverheadUIManager();
  const entity = createMockEntity(229, 222, 'Chaser: Blinky'); // dist = 29px (halfway between 20 and 38)
  const player = { x: 200, y: 222 };

  manager.update([entity], player, 16, true);

  assert.ok(entity.overheadUI.currentAlpha > 0.0, 'Alpha must be greater than 0');
  assert.ok(entity.overheadUI.currentAlpha <= 0.15, 'Alpha must be clamped to <= 0.15 within bubble');
});

test('Tier 5 [Player Bubble]: Entity outside R > 38px maintains full opacity (1.0)', () => {
  const manager = new OverheadUIManager();
  const entity = createMockEntity(300, 200, 'Chaser: Blinky'); // dist = 100px
  const player = { x: 200, y: 200 };

  manager.update([entity], player, 16, true);

  assert.equal(entity.overheadUI.currentAlpha, 1.0, 'Entity outside bubble must have alpha = 1.0');
});

test('Tier 5 [Player Bubble]: Frame-over-frame lerp provides smooth alpha decay without popping', () => {
  const manager = new OverheadUIManager();
  const entity = createMockEntity(200, 222, 'Chaser: Blinky');
  const player = { x: 200, y: 200 };

  assert.equal(entity.overheadUI.currentAlpha, 1.0);

  // Tick 1 frame at delta = 16ms without immediate flag
  manager.update([entity], player, 16, false);
  const alphaAfterFrame1 = entity.overheadUI.currentAlpha;
  assert.ok(alphaAfterFrame1 < 1.0, 'Alpha must start decaying');
  assert.ok(alphaAfterFrame1 > 0.5, 'Alpha must not pop directly to 0 in 1 frame');

  // Tick 10 more frames
  for (let f = 0; f < 10; f++) {
    manager.update([entity], player, 16, false);
  }
  const alphaAfterFrame11 = entity.overheadUI.currentAlpha;
  assert.ok(alphaAfterFrame11 < alphaAfterFrame1, 'Alpha must continuously decay');
});

/* ==============================================================================
 * TIER 6: STAGGERED FLOATING TEXT QUEUE (+16px CASCADE)
 * ============================================================================== */

test('Tier 6 [Floating Text]: Rapid pickups within 450ms cascade vertically by +16px each', () => {
  const ftManager = new FloatingTextManager();
  const time = 1000;
  const x = 200;
  const y = 300;

  const offset1 = ftManager.getCascadeOffset(x, y, time);
  assert.equal(offset1, 0, 'First pickup has 0px offset');

  const offset2 = ftManager.getCascadeOffset(x, y, time + 50);
  assert.equal(offset2, 16, 'Second rapid pickup cascades by 16px');

  const offset3 = ftManager.getCascadeOffset(x, y, time + 100);
  assert.equal(offset3, 32, 'Third rapid pickup cascades by 32px');

  const offset4 = ftManager.getCascadeOffset(x, y, time + 150);
  assert.equal(offset4, 48, 'Fourth rapid pickup cascades by 48px');
});

test('Tier 6 [Floating Text]: Distant pickups (> 30px away) do not trigger cascade offset', () => {
  const ftManager = new FloatingTextManager();
  const time = 1000;

  const offsetA = ftManager.getCascadeOffset(100, 100, time);
  const offsetB = ftManager.getCascadeOffset(200, 100, time); // 100px away

  assert.equal(offsetA, 0);
  assert.equal(offsetB, 0, 'Distant pickup must not cascade');
});

test('Tier 6 [Floating Text]: Expired pickups (> 450ms) are pruned and reset cascade offset', () => {
  const ftManager = new FloatingTextManager();
  const time = 1000;

  ftManager.getCascadeOffset(200, 200, time);
  ftManager.getCascadeOffset(200, 200, time + 50);

  // Advance time past 450ms window
  const offsetAfterExpiry = ftManager.getCascadeOffset(200, 200, time + 600);
  assert.equal(offsetAfterExpiry, 0, 'After 450ms cooldown, cascade offset resets to 0');
});

/* ==============================================================================
 * TIER 7: BOMB TILES DUCK-TYPING (Set<string>, Uint8Array, FlatHazardMask)
 * ============================================================================== */

test('Tier 7 [Duck-Typing]: isTileInHazardMask operates identically across all representations', () => {
  const setBombs = new Set(['1,1', '3,5', '5,9']);
  const maskBombs = new FlatHazardMask();
  maskBombs.add('1,1').add('3,5').add('5,9');

  const rawArray = new Uint8Array(ROWS * COLS);
  rawArray[1 * COLS + 1] = 1;
  rawArray[3 * COLS + 5] = 1;
  rawArray[5 * COLS + 9] = 1;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const fromSet = isTileInHazardMask(setBombs, r, c);
      const fromMask = isTileInHazardMask(maskBombs, r, c);
      const fromArray = isTileInHazardMask(rawArray, r, c);

      assert.equal(fromSet, fromMask, `Set vs Mask mismatch at (${r},${c})`);
      assert.equal(fromSet, fromArray, `Set vs Array mismatch at (${r},${c})`);
    }
  }
});

test('Tier 7 [Duck-Typing]: cloneBombTilesAsSet correctly converts all representations to Set<string>', () => {
  const setInput = new Set(['2,3', '4,5']);
  const maskInput = new FlatHazardMask();
  maskInput.add('2,3').add('4,5');

  const arrayInput = new Uint8Array(ROWS * COLS);
  arrayInput[2 * COLS + 3] = 1;
  arrayInput[4 * COLS + 5] = 1;

  const setFromSet = cloneBombTilesAsSet(setInput);
  const setFromMask = cloneBombTilesAsSet(maskInput);
  const setFromArray = cloneBombTilesAsSet(arrayInput);

  assert.deepEqual(setFromSet, setInput);
  assert.deepEqual(setFromMask, setInput);
  assert.deepEqual(setFromArray, setInput);
});

test('Tier 7 [Duck-Typing]: getSafeDemolitionApproaches returns identical approaches with FlatHazardMask', () => {
  const map = createStandardMap();
  map[1][3] = TILE_BLOCK;
  map[1][1] = TILE_EMPTY;
  map[1][2] = TILE_EMPTY;
  map[1][4] = TILE_EMPTY;

  const setBombs = new Set(['1,4']);
  const maskBombs = new FlatHazardMask();
  maskBombs.add('1,4');

  const approachesFromSet = getSafeDemolitionApproaches({ r: 1, c: 3 }, map, setBombs, 2, 8);
  const approachesFromMask = getSafeDemolitionApproaches({ r: 1, c: 3 }, map, maskBombs, 2, 8);

  assert.deepEqual(approachesFromSet, approachesFromMask, 'Demolition approaches must match identically');
});

/* ==============================================================================
 * TIER 8: HEADLESS OVERHEAD UI INVARIANTS & MULTI-LIFECYCLE STRESS
 * ============================================================================== */

test('Tier 8 [Headless UI]: getRenderLayers preserves default reference offsets without scene', () => {
  const ui = new OverheadUI(null, 'Chaser: Blinky', 'enemy', 3, 24);
  ui.update(100, 200, 2);
  ui.setIntent('!', true);

  const layers = ui.getRenderLayers();
  assert.equal(layers.tier1_hp.y, 200 - 14);
  assert.equal(layers.tier2_name.y, 200 - 22);
  assert.equal(layers.tier3_intent.y, 200 - 34);

  // Clearances
  assert.equal(layers.tier1_hp.y - layers.tier2_name.y, 8);
  assert.equal(layers.tier2_name.y - layers.tier3_intent.y, 12);
});

test('Tier 8 [Stress]: 1,000 rapid declutter and LOD updates complete in < 50ms with 0 NaN', () => {
  const manager = new OverheadUIManager();
  const entities = [];
  for (let i = 0; i < 8; i++) {
    entities.push(createMockEntity(100 + i * 20, 200 + (i % 2) * 15, `Enemy ${i}`));
  }
  const player = { x: 150, y: 200 };

  const start = performance.now();
  for (let iter = 0; iter < 1000; iter++) {
    // Dynamic positions
    entities[0].x = 100 + Math.sin(iter * 0.1) * 30;
    entities[1].x = 120 + Math.cos(iter * 0.1) * 30;
    manager.update(entities, player, 16, false);
  }
  const duration = performance.now() - start;

  assert.ok(duration < 50, `1000 updates must complete within 50ms (took ${duration.toFixed(2)}ms)`);

  for (const e of entities) {
    assert.ok(!Number.isNaN(e.overheadUI.currentAlpha), 'Alpha must not be NaN');
    assert.ok(!Number.isNaN(e.overheadUI.customOffsetX), 'OffsetX must not be NaN');
    assert.ok(!Number.isNaN(e.overheadUI.customOffsetY), 'OffsetY must not be NaN');
    assert.ok(e.overheadUI.currentAlpha >= 0 && e.overheadUI.currentAlpha <= 1.0, 'Alpha in [0, 1]');
  }
});
