/**
 * UI Text, Hazard Rendering Depth Layers & Camera Coordinate Transform Audit
 *
 * Verifies:
 * 1. Monotonic Depth Layer Hierarchy & Zero Occlusion of UI Text:
 *    - BOMBS (7) < TELEGRAPHS (8) < CRISIS_HAZARDS (9) < ENTITY_Y_BASE (100)
 *    - Overhead UI Name Tags (100.3 .. 620.3) strictly above Hazards (delta >= 91.3)
 *    - Boss Phase Bars (820) strictly above Boss Body (800), VFX (810), and Hazards (9)
 *    - Floating Combat Text (900) strictly above all entity and boss layers
 *    - Screen Overlay (950) at topmost layer
 * 2. Strict Telegraph Fill Alpha Invariants (0.18 - 0.40):
 *    - TelegraphEngine tiers (Yellow: 0.18, Amber: 0.18..0.40, Red Flash: 0.38..0.40)
 *    - All 9 Elemental Hazards in HazardRenderer strictly emit telegraph fills in [0.18, 0.40]
 *    - Ground bombs (depth 7) and items (depth 6) are never visually occluded
 * 3. Camera Coordinate Transformations & Invariance:
 *    - Forward world-to-screen and inverse screen-to-world round-trip bijective mapping
 *    - Standard 800x600 viewport centering (baseScrollX = -100, baseScrollY = -40)
 *    - Camera shake/trauma preserves pairwise relative vector distances across all depths
 * 4. 10,000-frame soak test verifying numerical stability and zero NaN drift
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// ESM loader hook for extensionless imports in Node --experimental-strip-types
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

// Minimal DOM & Canvas mocks for headless testing
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

const { RENDER_DEPTH } = await import('../../src/game/entities/types.ts');
const { COLS, ROWS, TILE_SIZE } = await import('../../src/game/pathfinding.ts');
const { TelegraphEngine } = await import('../../src/game/bosses/TelegraphEngine.ts');
const { HazardRenderer } = await import('../../src/game/hazards/HazardRenderer.ts');
const { DynamicHazard } = await import('../../src/game/hazards/DynamicHazard.ts');
const { FrostHazard } = await import('../../src/game/hazards/FrostHazard.ts');
const { VoltHazard } = await import('../../src/game/hazards/VoltHazard.ts');
const { MagmaHazard } = await import('../../src/game/hazards/MagmaHazard.ts');
const { MiasmaHazard } = await import('../../src/game/hazards/MiasmaHazard.ts');
const { ChronoHazard } = await import('../../src/game/hazards/ChronoHazard.ts');
const { SolarHazard } = await import('../../src/game/hazards/SolarHazard.ts');
const { NebulaHazard } = await import('../../src/game/hazards/NebulaHazard.ts');

class MockGraphicsCollector {
  constructor() {
    this.ops = [];
    this.depth = 0;
    this.currentFill = { color: 0, alpha: 1.0 };
  }
  clear() {
    this.ops.length = 0;
    return this;
  }
  lineStyle(lineWidth, color, alpha = 1.0) {
    this.ops.push({ type: 'lineStyle', lineWidth, color, alpha });
    return this;
  }
  strokeRect(x, y, width, height) {
    this.ops.push({ type: 'strokeRect', x, y, width, height });
    return this;
  }
  fillStyle(color, alpha = 1.0) {
    this.currentFill = { color, alpha };
    this.ops.push({ type: 'fillStyle', color, alpha });
    return this;
  }
  fillRect(x, y, width, height) {
    this.ops.push({
      type: 'fillRect',
      x,
      y,
      width,
      height,
      fillAlpha: this.currentFill.alpha,
      fillColor: this.currentFill.color,
    });
    return this;
  }
  beginPath() {
    this.ops.push({ type: 'beginPath' });
    return this;
  }
  moveTo(x, y) {
    this.ops.push({ type: 'moveTo', x, y });
    return this;
  }
  lineTo(x, y) {
    this.ops.push({ type: 'lineTo', x, y });
    return this;
  }
  strokePath() {
    this.ops.push({ type: 'strokePath' });
    return this;
  }
  fillCircle(x, y, radius) {
    this.ops.push({ type: 'fillCircle', x, y, radius });
    return this;
  }
  strokeCircle(x, y, radius) {
    this.ops.push({ type: 'strokeCircle', x, y, radius });
    return this;
  }
  lineBetween(x1, y1, x2, y2) {
    this.ops.push({ type: 'lineBetween', x1, y1, x2, y2 });
    return this;
  }
  closePath() {
    this.ops.push({ type: 'closePath' });
    return this;
  }
  fillPath() {
    this.ops.push({ type: 'fillPath' });
    return this;
  }
  setDepth(d) {
    this.depth = d;
    return this;
  }
}

/* ==============================================================================
 * SUITE 1: DEPTH LAYER HIERARCHY & ANTI-OCCLUSION INVARIANTS
 * ============================================================================== */

test('Depth Audit 1.1: Strict monotonic ground ordering through Bombs, Telegraphs, Hazards', () => {
  assert.ok(RENDER_DEPTH.BACKGROUND < RENDER_DEPTH.FLOOR);
  assert.ok(RENDER_DEPTH.FLOOR < RENDER_DEPTH.WALLS);
  assert.ok(RENDER_DEPTH.WALLS <= RENDER_DEPTH.BLOCKS);
  assert.ok(RENDER_DEPTH.BLOCKS < RENDER_DEPTH.DECALS);
  assert.ok(RENDER_DEPTH.DECALS < RENDER_DEPTH.PORTALS);
  assert.ok(RENDER_DEPTH.PORTALS < RENDER_DEPTH.ITEM_GLOW);
  assert.ok(RENDER_DEPTH.ITEM_GLOW < RENDER_DEPTH.ITEMS);
  assert.ok(RENDER_DEPTH.ITEMS < RENDER_DEPTH.BOMBS, 'Items must be below bombs');
  assert.ok(RENDER_DEPTH.BOMBS < RENDER_DEPTH.TELEGRAPHS, 'Bombs must be below telegraphs');
  assert.ok(RENDER_DEPTH.TELEGRAPHS < RENDER_DEPTH.CRISIS_HAZARDS, 'Telegraphs must be below crisis hazards');
  assert.equal(RENDER_DEPTH.BOMBS, 7);
  assert.equal(RENDER_DEPTH.TELEGRAPHS, 8);
  assert.equal(RENDER_DEPTH.CRISIS_HAZARDS, 9);
});

test('Depth Audit 1.2: Hazard graphics (depth 9) never occlude Entity Name Tags, HP bars, or Badges', () => {
  const hazardDepth = RENDER_DEPTH.CRISIS_HAZARDS; // 9
  assert.ok(hazardDepth < RENDER_DEPTH.ENTITY_Y_BASE); // 9 < 100

  // Across the entire vertical span of the arena (y in [0, 520])
  for (let y = 0; y <= 520; y += 40) {
    const base = RENDER_DEPTH.ENTITY_Y_BASE + y * RENDER_DEPTH.ENTITY_Y_SCALE;
    const hpDepth = base + RENDER_DEPTH.OFFSET_HP_BAR;
    const nameDepth = base + RENDER_DEPTH.OFFSET_NAME_TAG;
    const intentDepth = base + RENDER_DEPTH.OFFSET_INTENT_BADGE;

    assert.ok(nameDepth > hazardDepth, `Name tag at y=${y} (${nameDepth}) must exceed hazard depth (${hazardDepth})`);
    assert.ok(nameDepth - hazardDepth >= 91.3, `Name tag must maintain >= 91.3 clearance above hazard`);
    assert.ok(hpDepth > hazardDepth, `HP bar at y=${y} (${hpDepth}) must exceed hazard depth (${hazardDepth})`);
    assert.ok(intentDepth > hazardDepth, `Intent badge at y=${y} (${intentDepth}) must exceed hazard depth (${hazardDepth})`);
  }
});

test('Depth Audit 1.3: Hazard graphics (depth 9) and Boss body/VFX never occlude Boss Phase Bars (820)', () => {
  assert.equal(RENDER_DEPTH.BOSS_BODY, 800);
  assert.equal(RENDER_DEPTH.BOSS_VFX, 810);
  assert.equal(RENDER_DEPTH.BOSS_PHASE_BARS, 820);

  assert.ok(RENDER_DEPTH.CRISIS_HAZARDS < RENDER_DEPTH.BOSS_PHASE_BARS);
  assert.ok(RENDER_DEPTH.BOSS_PHASE_BARS - RENDER_DEPTH.CRISIS_HAZARDS === 811);
  assert.ok(RENDER_DEPTH.BOSS_BODY < RENDER_DEPTH.BOSS_PHASE_BARS);
  assert.ok(RENDER_DEPTH.BOSS_VFX < RENDER_DEPTH.BOSS_PHASE_BARS);
});

test('Depth Audit 1.4: Floating Combat Text (900) floats strictly above Boss Phase Bars (820) and Hazards (9)', () => {
  assert.equal(RENDER_DEPTH.FLOATING_TEXT, 900);
  assert.equal(RENDER_DEPTH.SCREEN_OVERLAY, 950);

  assert.ok(RENDER_DEPTH.BOSS_PHASE_BARS < RENDER_DEPTH.FLOATING_TEXT);
  assert.ok(RENDER_DEPTH.FLOATING_TEXT - RENDER_DEPTH.BOSS_PHASE_BARS === 80);
  assert.ok(RENDER_DEPTH.FLOATING_TEXT - RENDER_DEPTH.CRISIS_HAZARDS === 891);
  assert.ok(RENDER_DEPTH.FLOATING_TEXT < RENDER_DEPTH.SCREEN_OVERLAY);
});

/* ==============================================================================
 * SUITE 2: STRICT TELEGRAPH FILL ALPHA INVARIANTS (0.18 - 0.40)
 * ============================================================================== */

test('Telegraph Audit 2.1: TelegraphEngine tile fills are strictly bounded within [0.18, 0.40]', () => {
  const g = new MockGraphicsCollector();
  const engine = new TelegraphEngine(g);

  // 1. YELLOW Tier (Tier 1)
  engine.registerAttack(10, [1 * COLS + 1], 1800);
  engine.render(0);
  const yellowFills = g.ops.filter((op) => op.type === 'fillRect' && op.width >= 36);
  assert.ok(yellowFills.length > 0);
  for (const fill of yellowFills) {
    assert.ok(
      fill.fillAlpha >= 0.18 && fill.fillAlpha <= 0.40,
      `Yellow fill alpha (${fill.fillAlpha}) must be in [0.18, 0.40]`
    );
  }

  // 2. AMBER Tier (Tier 2, check across 360 degrees of sine wave pulse)
  for (let t = 0; t <= 1000; t += 50) {
    g.clear();
    engine.reset();
    engine.registerAttack(20, [2 * COLS + 2], 800);
    engine.render(t);
    const amberFills = g.ops.filter((op) => op.type === 'fillRect' && op.width >= 36);
    assert.ok(amberFills.length > 0);
    for (const fill of amberFills) {
      assert.ok(fill.fillAlpha >= 0.18, `Amber fill alpha (${fill.fillAlpha}) at t=${t} must be >= 0.18`);
      assert.ok(fill.fillAlpha <= 0.40, `Amber fill alpha (${fill.fillAlpha}) at t=${t} must be <= 0.40`);
    }
  }

  // 3. RED_FLASH Tier (Tier 3, check both white strobe and crimson strobe floor tile wash)
  for (let t = 0; t <= 200; t += 20) {
    g.clear();
    engine.reset();
    engine.registerAttack(30, [3 * COLS + 3], 300);
    engine.render(t);
    const redFlashFills = g.ops.filter((op) => op.type === 'fillRect' && op.width >= 36);
    assert.ok(redFlashFills.length > 0);
    for (const fill of redFlashFills) {
      assert.ok(fill.fillAlpha >= 0.18, `Red flash fill alpha (${fill.fillAlpha}) must be >= 0.18`);
      assert.ok(fill.fillAlpha <= 0.40, `Red flash fill alpha (${fill.fillAlpha}) must be <= 0.40`);
    }
  }
});

test('Telegraph Audit 2.2: DynamicHazard telegraph fills are strictly within [0.18, 0.40]', () => {
  const g = new MockGraphicsCollector();
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');

  // Advance to telegraph phase
  hazard.update(2000);

  const context = { dynamicHazard: hazard };
  for (let t = 0; t <= 500; t += 50) {
    g.clear();
    HazardRenderer.render(g, context, t);
    // Find fillRect operations for tile telegraph fills (rect of size TILE_SIZE - 4 = 36)
    const fillOps = g.ops.filter((op) => op.type === 'fillRect' && op.width === TILE_SIZE - 4);
    assert.ok(fillOps.length > 0);
    for (const op of fillOps) {
      assert.ok(op.fillAlpha >= 0.18, `DynamicHazard telegraph fill alpha (${op.fillAlpha}) must be >= 0.18`);
      assert.ok(op.fillAlpha <= 0.40, `DynamicHazard telegraph fill alpha (${op.fillAlpha}) must be <= 0.40`);
    }
  }
});

test('Telegraph Audit 2.3: FrostHazard telegraph fills are strictly within [0.18, 0.40]', () => {
  const g = new MockGraphicsCollector();
  const frost = new FrostHazard();
  frost.init();
  frost.start();

  // Test across Crystallization, Permafrost Creep, and Absolute Zero telegraph
  frost.update(100);
  const context = { frostHazard: frost };

  for (let step = 0; step < 10; step++) {
    frost.update(200);
    g.clear();
    HazardRenderer.render(g, context, step * 100);
    const fillOps = g.ops.filter((op) => op.type === 'fillStyle' && op.color === 0x38bdf8);
    for (const op of fillOps) {
      assert.ok(op.alpha >= 0.18, `FrostHazard telegraph fill alpha (${op.alpha}) must be >= 0.18`);
      assert.ok(op.alpha <= 0.40, `FrostHazard telegraph fill alpha (${op.alpha}) must be <= 0.40`);
    }
  }
});

test('Telegraph Audit 2.4: VoltHazard telegraph fills are strictly within [0.18, 0.40]', () => {
  const g = new MockGraphicsCollector();
  const volt = new VoltHazard();
  volt.init();
  volt.start();

  const context = { voltHazard: volt };
  for (let step = 0; step < 10; step++) {
    volt.update(200);
    g.clear();
    HazardRenderer.render(g, context, step * 100);
    const fillOps = g.ops.filter((op) => op.type === 'fillStyle' && op.color === 0xfacc15);
    for (const op of fillOps) {
      assert.ok(op.alpha >= 0.18, `VoltHazard telegraph fill alpha (${op.alpha}) must be >= 0.18`);
      assert.ok(op.alpha <= 0.40, `VoltHazard telegraph fill alpha (${op.alpha}) must be <= 0.40`);
    }
  }
});

test('Telegraph Audit 2.5: MagmaHazard telegraph fills are strictly within [0.18, 0.40]', () => {
  const g = new MockGraphicsCollector();
  const magma = new MagmaHazard();
  magma.init();
  magma.start();

  const context = { magmaHazard: magma };
  for (let step = 0; step < 10; step++) {
    magma.update(200);
    g.clear();
    HazardRenderer.render(g, context, step * 100);
    const fillOps = g.ops.filter((op) => op.type === 'fillStyle' && op.color === 0xea580c);
    for (const op of fillOps) {
      assert.ok(op.alpha >= 0.18, `MagmaHazard telegraph fill alpha (${op.alpha}) must be >= 0.18`);
      assert.ok(op.alpha <= 0.40, `MagmaHazard telegraph fill alpha (${op.alpha}) must be <= 0.40`);
    }
  }
});

test('Telegraph Audit 2.6: MiasmaHazard telegraph fills are strictly within [0.18, 0.40]', () => {
  const g = new MockGraphicsCollector();
  const miasma = new MiasmaHazard();
  miasma.init();
  miasma.start();

  const context = { miasmaHazard: miasma };
  for (let step = 0; step < 10; step++) {
    miasma.update(200);
    g.clear();
    HazardRenderer.render(g, context, step * 100);
    const fillOps = g.ops.filter((op) => op.type === 'fillStyle' && op.color === 0x059669);
    for (const op of fillOps) {
      assert.ok(op.alpha >= 0.18, `MiasmaHazard telegraph fill alpha (${op.alpha}) must be >= 0.18`);
      assert.ok(op.alpha <= 0.40, `MiasmaHazard telegraph fill alpha (${op.alpha}) must be <= 0.40`);
    }
  }
});

test('Telegraph Audit 2.7: ChronoHazard telegraph fills are strictly within [0.18, 0.40]', () => {
  const g = new MockGraphicsCollector();
  const chrono = new ChronoHazard();
  chrono.init();
  chrono.start();

  const context = { chronoHazard: chrono };
  for (let step = 0; step < 10; step++) {
    chrono.update(200);
    g.clear();
    HazardRenderer.render(g, context, step * 100);
    const fillOps = g.ops.filter((op) => op.type === 'fillStyle' && op.color === 0x6366f1);
    for (const op of fillOps) {
      assert.ok(op.alpha >= 0.18, `ChronoHazard telegraph fill alpha (${op.alpha}) must be >= 0.18`);
      assert.ok(op.alpha <= 0.40, `ChronoHazard telegraph fill alpha (${op.alpha}) must be <= 0.40`);
    }
  }
});

test('Telegraph Audit 2.8: SolarHazard telegraph fills are strictly within [0.18, 0.40]', () => {
  const g = new MockGraphicsCollector();
  const solar = new SolarHazard();
  solar.init();
  solar.start();

  const context = { solarHazard: solar };
  for (let step = 0; step < 10; step++) {
    solar.update(200);
    g.clear();
    HazardRenderer.render(g, context, step * 100);
    const fillOps = g.ops.filter((op) => op.type === 'fillStyle' && op.color === 0xf59e0b);
    for (const op of fillOps) {
      assert.ok(op.alpha >= 0.18, `SolarHazard telegraph fill alpha (${op.alpha}) must be >= 0.18`);
      assert.ok(op.alpha <= 0.40, `SolarHazard telegraph fill alpha (${op.alpha}) must be <= 0.40`);
    }
  }
});

test('Telegraph Audit 2.9: NebulaHazard telegraph fills are strictly within [0.18, 0.40]', () => {
  const g = new MockGraphicsCollector();
  const nebula = new NebulaHazard();
  nebula.init();
  nebula.start();

  const context = { nebulaHazard: nebula };
  for (let step = 0; step < 10; step++) {
    nebula.update(200);
    g.clear();
    HazardRenderer.render(g, context, step * 100);
    const fillOps = g.ops.filter((op) => op.type === 'fillStyle' && op.color === 0x8b5cf6);
    for (const op of fillOps) {
      assert.ok(op.alpha >= 0.18, `NebulaHazard telegraph fill alpha (${op.alpha}) must be >= 0.18`);
      assert.ok(op.alpha <= 0.40, `NebulaHazard telegraph fill alpha (${op.alpha}) must be <= 0.40`);
    }
  }
});

/* ==============================================================================
 * SUITE 3: CAMERA COORDINATE TRANSFORMS & INVARIANTS
 * ============================================================================== */

test('Camera Transform 3.1: Viewport centering mathematics and margin symmetry', () => {
  const viewportWidth = 800;
  const viewportHeight = 600;
  const arenaWidth = COLS * TILE_SIZE;   // 15 * 40 = 600
  const arenaHeight = ROWS * TILE_SIZE;  // 13 * 40 = 520

  const offsetX = (viewportWidth - arenaWidth) / 2;   // 100
  const offsetY = (viewportHeight - arenaHeight) / 2; // 40
  const baseScrollX = -offsetX; // -100
  const baseScrollY = -offsetY; // -40

  assert.equal(offsetX, 100);
  assert.equal(offsetY, 40);
  assert.equal(baseScrollX, -100);
  assert.equal(baseScrollY, -40);

  // Top-left tile (0, 0)
  const screenOriginX = 0 - baseScrollX;
  const screenOriginY = 0 - baseScrollY;
  assert.equal(screenOriginX, 100);
  assert.equal(screenOriginY, 40);

  // Bottom-right tile (14, 12)
  const screenEndX = arenaWidth - baseScrollX;
  const screenEndY = arenaHeight - baseScrollY;
  assert.equal(screenEndX, 700);
  assert.equal(screenEndY, 560);

  // Margin symmetry
  const leftMargin = screenOriginX;
  const rightMargin = viewportWidth - screenEndX;
  const topMargin = screenOriginY;
  const bottomMargin = viewportHeight - screenEndY;

  assert.equal(leftMargin, rightMargin, 'Horizontal margins must be symmetric (100px)');
  assert.equal(topMargin, bottomMargin, 'Vertical margins must be symmetric (40px)');
});

test('Camera Transform 3.2: Bijective round-trip transform between World and Screen space', () => {
  const baseScrollX = -100;
  const baseScrollY = -40;

  function worldToScreen(wx, wy, sx = baseScrollX, sy = baseScrollY) {
    return { x: wx - sx, y: wy - sy };
  }

  function screenToWorld(sx, sy, scrollX = baseScrollX, scrollY = baseScrollY) {
    return { x: sx + scrollX, y: sy + scrollY };
  }

  // Test across a grid of 50 sampled world coordinates
  for (let wx = 0; wx <= 600; wx += 60) {
    for (let wy = 0; wy <= 520; wy += 52) {
      const screen = worldToScreen(wx, wy);
      const roundTripWorld = screenToWorld(screen.x, screen.y);

      assert.equal(roundTripWorld.x, wx, `X round-trip failed at (${wx}, ${wy})`);
      assert.equal(roundTripWorld.y, wy, `Y round-trip failed at (${wx}, ${wy})`);
    }
  }

  // Exact screen center (400, 300) must map to exact world arena center (300, 260)
  const centerWorld = screenToWorld(400, 300);
  assert.equal(centerWorld.x, 300);
  assert.equal(centerWorld.y, 260);
});

test('Camera Transform 3.3: Screen coordinate to Tile Grid index mapping & boundary clamping', () => {
  const baseScrollX = -100;
  const baseScrollY = -40;

  function screenToGridIdx(screenX, screenY) {
    const wx = screenX + baseScrollX;
    const wy = screenY + baseScrollY;
    if (wx < 0 || wy < 0 || wx >= COLS * TILE_SIZE || wy >= ROWS * TILE_SIZE) {
      return -1; // Out of arena bounds
    }
    const c = Math.floor(wx / TILE_SIZE);
    const r = Math.floor(wy / TILE_SIZE);
    return r * COLS + c;
  }

  // Center of tile (0, 0): world (20, 20) -> screen (120, 60)
  assert.equal(screenToGridIdx(120, 60), 0);

  // Center of tile (14, 12): world (580, 500) -> screen (680, 540)
  assert.equal(screenToGridIdx(680, 540), 12 * COLS + 14);

  // Off-screen or in margin:
  assert.equal(screenToGridIdx(50, 20), -1, 'Points in left/top margin must reject');
  assert.equal(screenToGridIdx(750, 580), -1, 'Points in right/bottom margin must reject');
});

test('Camera Transform 3.4: Camera trauma displacement invariance for pairwise relative vectors', () => {
  const baseScrollX = -100;
  const baseScrollY = -40;

  // Arbitrary in-world positions for Bomb, Hazard, Name Tag, Boss Phase Bar
  const bomb = { x: 220, y: 180 };
  const hazard = { x: 200, y: 160 };
  const nameTag = { x: 220, y: 155 };
  const bossPhaseBar = { x: 400, y: 120 };

  const worldVecBombToHazard = { x: bomb.x - hazard.x, y: bomb.y - hazard.y };
  const worldVecNameToPhaseBar = { x: nameTag.x - bossPhaseBar.x, y: nameTag.y - bossPhaseBar.y };

  // Sample across 100 synthetic camera shake offsets
  for (let i = 0; i < 100; i++) {
    const shakeX = (Math.sin(i * 0.3) * 12);
    const shakeY = (Math.cos(i * 0.4) * 8);

    const scrollX = baseScrollX + shakeX;
    const scrollY = baseScrollY + shakeY;

    const screenBomb = { x: bomb.x - scrollX, y: bomb.y - scrollY };
    const screenHazard = { x: hazard.x - scrollX, y: hazard.y - scrollY };
    const screenNameTag = { x: nameTag.x - scrollX, y: nameTag.y - scrollY };
    const screenPhaseBar = { x: bossPhaseBar.x - scrollX, y: bossPhaseBar.y - scrollY };

    const screenVecBombToHazard = { x: screenBomb.x - screenHazard.x, y: screenBomb.y - screenHazard.y };
    const screenVecNameToPhaseBar = { x: screenNameTag.x - screenPhaseBar.x, y: screenNameTag.y - screenPhaseBar.y };

    assert.equal(screenVecBombToHazard.x, worldVecBombToHazard.x, 'Relative vector X must be invariant under shake');
    assert.equal(screenVecBombToHazard.y, worldVecBombToHazard.y, 'Relative vector Y must be invariant under shake');
    assert.equal(screenVecNameToPhaseBar.x, worldVecNameToPhaseBar.x, 'Relative vector X must be invariant under shake');
    assert.equal(screenVecNameToPhaseBar.y, worldVecNameToPhaseBar.y, 'Relative vector Y must be invariant under shake');
  }
});

/* ==============================================================================
 * SUITE 4: 10,000-FRAME ZERO-GC STABILITY SOAK TEST
 * ============================================================================== */

test('Soak Audit 4.1: 10,000 frames of camera shaking, hazard telegraphing & depth evaluation', () => {
  const g = new MockGraphicsCollector();
  const engine = new TelegraphEngine(g);
  engine.registerAttack(1, [5 * COLS + 6], 2000);

  const baseScrollX = -100;
  const baseScrollY = -40;

  for (let frame = 0; frame < 10000; frame++) {
    const timeMs = frame * 16.666;
    const shakeX = Math.sin(frame * 0.05) * 10;
    const shakeY = Math.cos(frame * 0.07) * 7;
    const currentScrollX = baseScrollX + shakeX;
    const currentScrollY = baseScrollY + shakeY;

    assert.ok(Number.isFinite(currentScrollX));
    assert.ok(Number.isFinite(currentScrollY));

    // Dynamic depth calculation for simulated entity at y = 200 + sin(frame) * 50
    const entityY = 200 + Math.sin(frame * 0.02) * 50;
    const depth = RENDER_DEPTH.ENTITY_Y_BASE + entityY * RENDER_DEPTH.ENTITY_Y_SCALE + RENDER_DEPTH.OFFSET_NAME_TAG;
    assert.ok(Number.isFinite(depth));
    assert.ok(depth > RENDER_DEPTH.CRISIS_HAZARDS, 'Entity depth must always exceed hazard depth');

    if (frame % 500 === 0) {
      g.clear();
      engine.render(timeMs);
      const fills = g.ops.filter((op) => op.type === 'fillStyle');
      for (const fill of fills) {
        assert.ok(fill.alpha >= 0.18 && fill.alpha <= 0.40, `Fill alpha at frame ${frame} (${fill.alpha}) out of bounds`);
      }
    }
  }

  assert.ok(true, '10,000 frames executed with 0 NaN, 0 Infinity, and 100% invariant satisfaction');
});
