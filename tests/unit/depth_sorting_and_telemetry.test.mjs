/**
 * tests/unit/depth_sorting_and_telemetry.test.mjs
 *
 * Dedicated UI Depth, OverheadUIManager, FloatingTextManager, BossHUD,
 * Telegraphs, and Hazard Layers Depth Sorting & Anti-Occlusion Audit Suite.
 *
 * Verifies:
 * 1. Global RENDER_DEPTH Partition Invariants & Monotonicity
 * 2. Zero Occlusion Guarantee for OverheadUI & OverheadUIManager (vs Hazards & Entities)
 * 3. FloatingTextManager Anti-Occlusion & Cascade Progression (vs Boss Body & Phase Bars)
 * 4. BossHUD & In-World Boss Phase Bars Depth & Event Telemetry
 * 5. Telegraph & Hazard Alpha Translucency & Visibility Invariants
 * 6. Comprehensive 10,000-Frame Chaos Depth & Occlusion Soak Test with Structured Telemetry
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
const { COLS } = await import('../../src/game/pathfinding.ts');
const { OverheadUI } = await import('../../src/game/entities/OverheadUI.ts');
const { OverheadUIManager } = await import('../../src/game/ui/OverheadUIManager.ts');
const { FloatingTextManager } = await import('../../src/game/ui/FloatingTextManager.ts');
const { BossHUD } = await import('../../src/game/bosses/BossHUD.ts');
const { BossState } = await import('../../src/game/bosses/BossTypes.ts');
const { TelegraphEngine } = await import('../../src/game/bosses/TelegraphEngine.ts');

/**
 * Headless Mock Scene Factory for Phaser Game Objects
 */
function createMockScene() {
  const objects = [];
  return {
    add: {
      graphics: () => {
        const g = {
          active: true,
          visible: true,
          depth: 0,
          alpha: 1.0,
          currentFillColor: 0,
          currentFillAlpha: 1.0,
          ops: [],
          setDepth(d) {
            g.depth = d;
            return g;
          },
          setAlpha(a) {
            g.alpha = a;
            return g;
          },
          setVisible(v) {
            g.visible = v;
            return g;
          },
          setActive(a) {
            g.active = a;
            return g;
          },
          clear() {
            g.ops.length = 0;
            return g;
          },
          fillStyle(color, alpha = 1.0) {
            g.currentFillColor = color;
            g.currentFillAlpha = alpha;
            g.ops.push({ type: 'fillStyle', color, alpha });
            return g;
          },
          fillRect(x, y, w, h) {
            g.ops.push({ type: 'fillRect', x, y, width: w, height: h, fillAlpha: g.currentFillAlpha, fillColor: g.currentFillColor });
            return g;
          },
          lineStyle(w, color, alpha = 1.0) {
            g.ops.push({ type: 'lineStyle', lineWidth: w, color, alpha });
            return g;
          },
          strokeRect(x, y, w, h) {
            g.ops.push({ type: 'strokeRect', x, y, width: w, height: h });
            return g;
          },
          beginPath() {
            g.ops.push({ type: 'beginPath' });
            return g;
          },
          moveTo(x, y) {
            g.ops.push({ type: 'moveTo', x, y });
            return g;
          },
          lineTo(x, y) {
            g.ops.push({ type: 'lineTo', x, y });
            return g;
          },
          lineBetween(x1, y1, x2, y2) {
            g.ops.push({ type: 'lineBetween', x1, y1, x2, y2 });
            return g;
          },
          strokePath() {
            g.ops.push({ type: 'strokePath' });
            return g;
          },
          destroy() {
            g.active = false;
          },
        };
        objects.push(g);
        return g;
      },
      text: (x, y, str) => {
        const t = {
          x,
          y,
          text: str,
          active: true,
          visible: true,
          depth: 0,
          alpha: 1.0,
          originX: 0,
          originY: 0,
          setPosition(nx, ny) {
            t.x = nx;
            t.y = ny;
            return t;
          },
          setText(ns) {
            t.text = ns;
            return t;
          },
          setDepth(d) {
            t.depth = d;
            return t;
          },
          setAlpha(a) {
            t.alpha = a;
            return t;
          },
          setVisible(v) {
            t.visible = v;
            return t;
          },
          setActive(a) {
            t.active = a;
            return t;
          },
          setOrigin(ox, oy) {
            t.originX = ox;
            t.originY = oy;
            return t;
          },
          setColor() {
            return t;
          },
          destroy() {
            t.active = false;
          },
        };
        objects.push(t);
        return t;
      },
    },
    objects,
  };
}

/**
 * Mock Entity Generator
 */
function createMockEntity(x, y, name, faction, maxHp, mockScene) {
  const overheadUI = new OverheadUI(mockScene, name, faction, maxHp, 24);
  overheadUI.update(x, y, maxHp, maxHp, faction);
  let depth = 0;
  return {
    x,
    y,
    active: true,
    isDead: false,
    overheadUI,
    setDepth(d) {
      depth = d;
    },
    getDepth() {
      return depth;
    },
  };
}

/* ==============================================================================
 * SUITE 1: GLOBAL RENDER_DEPTH PARTITION INVARIANTS & MONOTONICITY
 * ============================================================================== */

test('Depth Hierarchy [Ground Partition]: Ground layers strictly monotonically ascend', () => {
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

  assert.equal(RENDER_DEPTH.BOMBS, 7);
  assert.equal(RENDER_DEPTH.TELEGRAPHS, 8);
  assert.equal(RENDER_DEPTH.CRISIS_HAZARDS, 9);
});

test('Depth Hierarchy [Partition Separation]: Ground < Entities < VFX < Boss < UI are strictly disjoint', () => {
  const maxGround = RENDER_DEPTH.CRISIS_HAZARDS; // 9
  const minEntityBase = RENDER_DEPTH.ENTITY_Y_BASE; // 100
  const minEntityDepth = minEntityBase + 0 * RENDER_DEPTH.ENTITY_Y_SCALE + RENDER_DEPTH.OFFSET_SHADOW; // 99.9

  // Ground to Entities Clearance >= 90.9
  assert.ok(maxGround < minEntityDepth, 'Ground layers must be strictly below dynamic entity band');
  assert.ok(minEntityDepth - maxGround >= 90.9, 'Clearance between hazards and entities must be >= 90.9');

  // Max entity depth in standard arena (rows=13, tileSize=40, height=520, margin=80 -> max y=600)
  const maxEntityDepth = minEntityBase + 600 * RENDER_DEPTH.ENTITY_Y_SCALE + RENDER_DEPTH.OFFSET_INTENT_BADGE; // 700.4
  assert.ok(maxEntityDepth < RENDER_DEPTH.EXPLOSIONS, 'Dynamic entities must be below world VFX');
  assert.ok(RENDER_DEPTH.EXPLOSIONS - maxEntityDepth >= 49.6, 'Clearance between entities and VFX must be >= 49.6');

  // World VFX Ordering
  assert.ok(RENDER_DEPTH.EXPLOSIONS < RENDER_DEPTH.SHOCKWAVES);
  assert.ok(RENDER_DEPTH.SHOCKWAVES < RENDER_DEPTH.DEBRIS_PARTICLES);
  assert.ok(RENDER_DEPTH.DEBRIS_PARTICLES < RENDER_DEPTH.BOSS_BODY);

  // Boss & In-World Bars
  assert.equal(RENDER_DEPTH.BOSS_BODY, 800);
  assert.equal(RENDER_DEPTH.BOSS_VFX, 810);
  assert.equal(RENDER_DEPTH.BOSS_PHASE_BARS, 820);
  assert.ok(RENDER_DEPTH.BOSS_BODY < RENDER_DEPTH.BOSS_VFX);
  assert.ok(RENDER_DEPTH.BOSS_VFX < RENDER_DEPTH.BOSS_PHASE_BARS);

  // Floating Labels & UI
  assert.equal(RENDER_DEPTH.FLOATING_TEXT, 900);
  assert.equal(RENDER_DEPTH.SCREEN_OVERLAY, 950);
  assert.ok(RENDER_DEPTH.BOSS_PHASE_BARS < RENDER_DEPTH.FLOATING_TEXT);
  assert.ok(RENDER_DEPTH.FLOATING_TEXT < RENDER_DEPTH.SCREEN_OVERLAY);
});

/* ==============================================================================
 * SUITE 2: ZERO OCCLUSION GUARANTEE FOR OVERHEAD UI & OVERHEAD UI MANAGER
 * ============================================================================== */

test('Overhead UI [Intra-Entity Sub-layers]: Strict monotonic ordering of sub-layers at all screen Y', () => {
  for (let y = -100; y <= 700; y += 25) {
    const base = RENDER_DEPTH.ENTITY_Y_BASE + y * RENDER_DEPTH.ENTITY_Y_SCALE;
    const shadow = base + RENDER_DEPTH.OFFSET_SHADOW;
    const sprite = base + RENDER_DEPTH.OFFSET_SPRITE;
    const shield = base + RENDER_DEPTH.OFFSET_SHIELD;
    const hp = base + RENDER_DEPTH.OFFSET_HP_BAR;
    const name = base + RENDER_DEPTH.OFFSET_NAME_TAG;
    const intent = base + RENDER_DEPTH.OFFSET_INTENT_BADGE;

    assert.ok(shadow < sprite, `Shadow must be below sprite at y=${y}`);
    assert.ok(sprite < shield, `Sprite must be below shield at y=${y}`);
    assert.ok(shield < hp, `Shield must be below HP bar at y=${y}`);
    assert.ok(hp < name, `HP bar must be below name tag at y=${y}`);
    assert.ok(name < intent, `Name tag must be below intent badge at y=${y}`);
  }
});

test('Overhead UI [Anti-Hazard Occlusion]: Name tags, HP bars, Intent badges NEVER occluded by hazards', () => {
  const mockScene = createMockScene();
  const manager = new OverheadUIManager(true);
  const hazardDepth = RENDER_DEPTH.CRISIS_HAZARDS; // 9

  // Test across entire vertical arena extent [0, 520]
  for (let y = 0; y <= 520; y += 40) {
    const entity = createMockEntity(200, y, `Enemy_${y}`, 'enemy', 3, mockScene);
    manager.update([entity], null, 16);

    const hpDepth = entity.overheadUI.hpGraphics?.depth;
    const nameDepth = entity.overheadUI.nameTag?.depth;
    const intentDepth = entity.overheadUI.indicator?.depth;

    assert.ok(nameDepth !== undefined && nameDepth > hazardDepth, `Name tag (${nameDepth}) must exceed hazard depth (${hazardDepth}) at y=${y}`);
    assert.ok(nameDepth - hazardDepth >= 91.3, `Name tag clearance must be >= 91.3 (got ${nameDepth - hazardDepth})`);
    assert.ok(hpDepth !== undefined && hpDepth > hazardDepth, `HP bar (${hpDepth}) must exceed hazard depth (${hazardDepth}) at y=${y}`);
    assert.ok(intentDepth !== undefined && intentDepth > hazardDepth, `Intent badge (${intentDepth}) must exceed hazard depth (${hazardDepth}) at y=${y}`);
  }
});

test('OverheadUIManager [Player Protection Bubble]: Entity labels within 20px decay to 0.0 alpha (zero occlusion)', () => {
  const mockScene = createMockScene();
  const manager = new OverheadUIManager(false);
  const player = { x: 200, y: 200 };

  // Entity within core bubble (10px distance)
  const closeEntity = createMockEntity(200, 210, 'Close Mob', 'enemy', 3, mockScene);
  manager.update([closeEntity], player, 16, true);
  assert.equal(closeEntity.overheadUI.currentAlpha, 0.0, 'Core zone (<= 20px) must have alpha 0.0 to prevent occluding player');

  // Entity in transition zone (30px distance)
  const midEntity = createMockEntity(200, 230, 'Mid Mob', 'enemy', 3, mockScene);
  manager.update([midEntity], player, 16, true);
  assert.ok(midEntity.overheadUI.currentAlpha <= 0.15, 'Transition zone (20-38px) must have alpha <= 0.15');

  // Entity outside bubble (100px distance)
  const farEntity = createMockEntity(200, 300, 'Far Mob', 'enemy', 3, mockScene);
  manager.update([farEntity], player, 16, true);
  assert.equal(farEntity.overheadUI.currentAlpha, 1.0, 'Outside bubble (> 38px) must have full alpha 1.0');
});

test('OverheadUIManager [AABB Repulsion & Vertical Staggering]: Overlapping labels pushed apart with zero visual occlusion', () => {
  const mockScene = createMockScene();
  const manager = new OverheadUIManager(true);

  // Two horizontally overlapping entities (dx = 30px, dy = 5px)
  const e1 = createMockEntity(150, 200, 'Alpha Mob', 'enemy', 3, mockScene);
  const e2 = createMockEntity(180, 202, 'Beta Mob', 'enemy', 3, mockScene);
  manager.update([e1, e2], null, 16, true);

  assert.ok(e1.overheadUI.customOffsetX < 0, 'Left mob must be pushed left');
  assert.ok(e2.overheadUI.customOffsetX > 0, 'Right mob must be pushed right');

  // Two tightly stacked collinear entities (dx = 10px < 24px)
  const e3 = createMockEntity(300, 200, 'Top Mob', 'enemy', 3, mockScene);
  const e4 = createMockEntity(305, 205, 'Bottom Mob', 'enemy', 3, mockScene);
  manager.update([e3, e4], null, 16, true);

  assert.equal(e3.overheadUI.customOffsetY, -14, 'Upper mob must stagger upwards by -14px');
  assert.equal(e4.overheadUI.customOffsetY, 46, 'Lower mob must stagger downwards by +46px');
});

/* ==============================================================================
 * SUITE 3: FLOATING TEXT MANAGER ANTI-OCCLUSION & CASCADE PROGRESSION
 * ============================================================================== */

test('Floating Combat Text [Depth Superiority]: Floats strictly above Boss Phase Bars (820), Boss VFX (810), Boss Body (800), and Hazards (9)', () => {
  assert.equal(RENDER_DEPTH.FLOATING_TEXT, 900);
  assert.ok(RENDER_DEPTH.FLOATING_TEXT > RENDER_DEPTH.BOSS_PHASE_BARS);
  assert.ok(RENDER_DEPTH.FLOATING_TEXT > RENDER_DEPTH.BOSS_VFX);
  assert.ok(RENDER_DEPTH.FLOATING_TEXT > RENDER_DEPTH.BOSS_BODY);
  assert.ok(RENDER_DEPTH.FLOATING_TEXT > RENDER_DEPTH.CRISIS_HAZARDS);

  assert.equal(RENDER_DEPTH.FLOATING_TEXT - RENDER_DEPTH.BOSS_PHASE_BARS, 80);
  assert.equal(RENDER_DEPTH.FLOATING_TEXT - RENDER_DEPTH.BOSS_VFX, 90);
  assert.equal(RENDER_DEPTH.FLOATING_TEXT - RENDER_DEPTH.BOSS_BODY, 100);
  assert.equal(RENDER_DEPTH.FLOATING_TEXT - RENDER_DEPTH.CRISIS_HAZARDS, 891);
});

test('Floating Combat Text [Cascade Progression & Clearance]: Consecutive bursts maintain >= 16px gap and >= 4px font clearance', () => {
  const manager = new FloatingTextManager();
  const originX = 250;
  const originY = 300;
  const now = 50000;
  const FONT_SIZE = 12;

  const offsets = [];
  for (let i = 0; i < 5; i++) {
    offsets.push(manager.getCascadeOffset(originX, originY, now));
  }

  for (let i = 0; i < 5; i++) {
    assert.equal(offsets[i], i * 16, `Burst ${i} must have exact cascade offset ${i * 16}`);
  }

  for (let i = 0; i < 4; i++) {
    const gap = offsets[i + 1] - offsets[i];
    assert.equal(gap, 16, 'Gap between consecutive text spawns must be exactly 16px');
    const clearance = gap - FONT_SIZE;
    assert.ok(clearance >= 4, `Clearance (${clearance}px) must be >= 4px above font size (zero overlap)`);
  }
});

/* ==============================================================================
 * SUITE 4: BOSS HUD & IN-WORLD BOSS PHASE BARS DEPTH & EVENT TELEMETRY
 * ============================================================================== */

test('Boss Phase Bars [Depth Monotonicity]: In-world Boss Phase Bars (820) strictly above Boss Body (800) and Boss VFX (810)', () => {
  assert.equal(RENDER_DEPTH.BOSS_BODY, 800);
  assert.equal(RENDER_DEPTH.BOSS_VFX, 810);
  assert.equal(RENDER_DEPTH.BOSS_PHASE_BARS, 820);

  assert.ok(RENDER_DEPTH.BOSS_BODY < RENDER_DEPTH.BOSS_PHASE_BARS, 'Boss Phase Bars must be strictly above Boss Body');
  assert.ok(RENDER_DEPTH.BOSS_VFX < RENDER_DEPTH.BOSS_PHASE_BARS, 'Boss Phase Bars must be strictly above Boss VFX');
  assert.ok(RENDER_DEPTH.BOSS_PHASE_BARS < RENDER_DEPTH.FLOATING_TEXT, 'Boss Phase Bars must be strictly below Floating Text');
});

test('BossHUD [Segmented State & Event Bridge]: Correctly tracks multi-phase HP segments, enrage, and stun telemetry', () => {
  const emittedEvents = [];
  const mockEmitter = {
    events: {
      emit(evt, payload) {
        emittedEvents.push({ evt, payload });
        return true;
      },
    },
  };

  const bossHUD = new BossHUD(mockEmitter);
  bossHUD.initBoss('king_gummy_bear');

  const state1 = bossHUD.getState();
  assert.equal(state1.isActive, true);
  assert.equal(state1.name, 'King Gummy Bear');
  assert.equal(state1.maxHp, 9);
  assert.equal(state1.currentHp, 9);
  assert.deepEqual(state1.phaseHpSegments, [3, 3, 3]);
  assert.equal(state1.activeSegmentIndex, 2); // 9 HP total, segment 2 holds 6..9

  // Damage into segment 1 (HP 5 -> segment index 1)
  bossHUD.setHp(5);
  const state2 = bossHUD.getState();
  assert.equal(state2.currentHp, 5);
  assert.equal(state2.activeSegmentIndex, 1);
  assert.equal(state2.activeSegmentHp, 2); // 5 - 3 = 2

  // Trigger Stun Window
  bossHUD.triggerStun(1.5, 'TACTICAL BOMB STUN');
  const state3 = bossHUD.getState();
  assert.equal(state3.isStunned, true);
  assert.equal(state3.stunRemainingMs, 1500);
  assert.equal(state3.state, BossState.STUNNED);

  // Trigger Berserk Enrage
  bossHUD.setEnraged(true);
  const state4 = bossHUD.getState();
  assert.equal(state4.isEnraged, true);
  assert.equal(state4.state, BossState.ENRAGED);

  // Verification of emitted telemetry events
  assert.ok(emittedEvents.length >= 3, 'BossHUD must emit state update events to React bridge');
  assert.ok(emittedEvents.every((e) => e.evt === 'boss-hud-update'), 'All events must be boss-hud-update');
});

/* ==============================================================================
 * SUITE 5: TELEGRAPH & HAZARD ALPHA TRANSLUCENCY INVARIANTS
 * ============================================================================== */

test('TelegraphEngine [Non-Occluding Alpha]: Telegraph danger fills are strictly bounded within [0.18, 0.40]', () => {
  const mockScene = createMockScene();
  const telegraphGraphics = mockScene.add.graphics();
  telegraphGraphics.setDepth(RENDER_DEPTH.TELEGRAPHS);
  assert.equal(telegraphGraphics.depth, 8);

  const engine = new TelegraphEngine(telegraphGraphics);
  engine.registerAttack(1, [1 * COLS + 1, 1 * COLS + 2], 2000);
  engine.render(0);

  const fillOps = telegraphGraphics.ops.filter((op) => op.type === 'fillRect');
  assert.ok(fillOps.length > 0, 'Telegraph fill rects must be rendered');
  for (const fill of fillOps) {
    assert.ok(
      fill.fillAlpha >= 0.18 && fill.fillAlpha <= 0.40,
      `Telegraph fill alpha (${fill.fillAlpha}) must be in [0.18, 0.40] to never occlude ground bombs (depth 7) or items (depth 6)`
    );
  }
});

/* ==============================================================================
 * SUITE 6: COMPREHENSIVE 10,000-FRAME CHAOS DEPTH & OCCLUSION SOAK TEST
 * ============================================================================== */

test('Soak Audit [10,000 Frames Depth & Telemetry]: Chaos simulation guarantees zero HUD occlusion and numerical stability', (t) => {
  const TOTAL_FRAMES = 10000;
  const mockScene = createMockScene();
  const manager = new OverheadUIManager(true);
  const floatingTextManager = new FloatingTextManager();
  const bossHUD = new BossHUD(null);
  bossHUD.initBoss('steam_toy_titan');

  const telegraphGraphics = mockScene.add.graphics();
  telegraphGraphics.setDepth(RENDER_DEPTH.TELEGRAPHS);
  const telegraphEngine = new TelegraphEngine(telegraphGraphics);

  // Entities
  const entities = [];
  const FACTIONS = ['enemy', 'ally', 'neutral'];
  for (let i = 0; i < 20; i++) {
    const faction = FACTIONS[i % FACTIONS.length];
    const maxHp = 1 + (i % 5);
    const x = 50 + (i * 25) % 500;
    const y = 50 + (i * 20) % 450;
    entities.push(createMockEntity(x, y, `Entity_${i}`, faction, maxHp, mockScene));
  }

  const player = { x: 300, y: 300 };
  const boss = { x: 320, y: 240, hp: 16 };

  // Telemetry metrics
  const telemetry = {
    totalFrames: 0,
    depthEvaluations: 0,
    overheadUpdates: 0,
    floatingTextSpawns: 0,
    bossHpUpdates: 0,
    telegraphRenders: 0,
    occlusionViolations: 0,
    nanOccurrences: 0,
    minDepthDeltaHudVsHazard: Infinity,
    minDepthDeltaFloatingVsBoss: Infinity,
    minDepthDeltaPhaseBarVsBoss: Infinity,
  };

  const startTime = Date.now();

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const timeMs = frame * 16.666;
    telemetry.totalFrames++;

    // 1. Entity Motion & Chaos Perturbations
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      e.x = 40 + Math.abs(Math.sin((frame + i * 37) * 0.02) * 520);
      e.y = 40 + Math.abs(Math.cos((frame + i * 29) * 0.02) * 440);

      // Periodically update HP
      if (frame % 200 === 0) {
        e.overheadUI.update(e.x, e.y, (frame / 200) % e.overheadUI.maxHp + 1);
      }
    }

    // 2. OverheadUIManager Pass
    manager.update(entities, player, 16);
    telemetry.overheadUpdates += entities.length;

    // 3. Boss Motion & Combat Damage
    if (frame % 150 === 0) {
      boss.hp = Math.max(1, (boss.hp - 1) % 16);
      bossHUD.setHp(boss.hp);
      telemetry.bossHpUpdates++;
    }
    bossHUD.update(16.666);

    // 4. Telegraph Attack Waves
    if (frame % 300 === 0) {
      const tile1 = (1 + (frame % 10)) * COLS + (1 + (frame % 10));
      telegraphEngine.registerAttack(frame, [tile1], 1500);
    }
    telegraphEngine.update(16.666);
    telegraphEngine.render(timeMs);
    telemetry.telegraphRenders++;

    // 5. Floating Text Burst
    if (frame % 20 === 0) {
      const offset = floatingTextManager.getCascadeOffset(player.x, player.y, timeMs);
      telemetry.floatingTextSpawns++;
      if (Number.isNaN(offset) || !Number.isFinite(offset)) {
        telemetry.nanOccurrences++;
      }
    }

    // 6. Monotonic Depth Invariant & Anti-Occlusion Check
    const hazardDepth = RENDER_DEPTH.CRISIS_HAZARDS; // 9
    const bossBodyDepth = RENDER_DEPTH.BOSS_BODY; // 800
    const bossPhaseBarDepth = RENDER_DEPTH.BOSS_PHASE_BARS; // 820
    const floatingTextDepth = RENDER_DEPTH.FLOATING_TEXT; // 900

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      const nameDepth = e.overheadUI.nameTag?.depth ?? 0;
      const hpDepth = e.overheadUI.hpGraphics?.depth ?? 0;
      telemetry.depthEvaluations += 2;

      if (Number.isNaN(nameDepth) || Number.isNaN(hpDepth)) {
        telemetry.nanOccurrences++;
      }

      // Check clearance above hazards
      const deltaHud = nameDepth - hazardDepth;
      if (deltaHud < telemetry.minDepthDeltaHudVsHazard) {
        telemetry.minDepthDeltaHudVsHazard = deltaHud;
      }
      if (nameDepth <= hazardDepth || hpDepth <= hazardDepth) {
        telemetry.occlusionViolations++;
      }
    }

    // Check boss phase bar vs boss body
    const deltaPhaseBar = bossPhaseBarDepth - bossBodyDepth;
    if (deltaPhaseBar < telemetry.minDepthDeltaPhaseBarVsBoss) {
      telemetry.minDepthDeltaPhaseBarVsBoss = deltaPhaseBar;
    }
    if (bossPhaseBarDepth <= bossBodyDepth) {
      telemetry.occlusionViolations++;
    }

    // Check floating text vs boss
    const deltaFloating = floatingTextDepth - bossBodyDepth;
    if (deltaFloating < telemetry.minDepthDeltaFloatingVsBoss) {
      telemetry.minDepthDeltaFloatingVsBoss = deltaFloating;
    }
    if (floatingTextDepth <= bossBodyDepth || floatingTextDepth <= bossPhaseBarDepth) {
      telemetry.occlusionViolations++;
    }
  }

  const durationMs = Date.now() - startTime;
  const avgFrameTimeUs = (durationMs / TOTAL_FRAMES) * 1000;

  // --- Telemetry Report Output ---
  t.diagnostic(`\n===============================================================`);
  t.diagnostic(`     CHAOS QA-3: UI DEPTH & OCCLUSION SENTINEL TELEMETRY       `);
  t.diagnostic(`===============================================================`);
  t.diagnostic(`Simulated Frames:               ${telemetry.totalFrames.toLocaleString()}`);
  t.diagnostic(`Execution Time:                 ${durationMs.toFixed(2)} ms (${avgFrameTimeUs.toFixed(2)} µs/frame)`);
  t.diagnostic(`Depth Evaluations:              ${telemetry.depthEvaluations.toLocaleString()}`);
  t.diagnostic(`Overhead UI Position Updates:   ${telemetry.overheadUpdates.toLocaleString()}`);
  t.diagnostic(`Floating Text Spawns:           ${telemetry.floatingTextSpawns.toLocaleString()}`);
  t.diagnostic(`Telegraph Render Passes:        ${telemetry.telegraphRenders.toLocaleString()}`);
  t.diagnostic(`Boss HP Segment Shifts:         ${telemetry.bossHpUpdates.toLocaleString()}`);
  t.diagnostic(`Min Clearance (HUD vs Hazard):  +${telemetry.minDepthDeltaHudVsHazard.toFixed(2)} units (Required: >= 91.0)`);
  t.diagnostic(`Min Clearance (Phase vs Boss):  +${telemetry.minDepthDeltaPhaseBarVsBoss.toFixed(2)} units (Required: >= 20.0)`);
  t.diagnostic(`Min Clearance (Text vs Boss):   +${telemetry.minDepthDeltaFloatingVsBoss.toFixed(2)} units (Required: >= 80.0)`);
  t.diagnostic(`Occlusion Violations:           ${telemetry.occlusionViolations} (MUST BE 0)`);
  t.diagnostic(`NaN / Infinity Errors:          ${telemetry.nanOccurrences} (MUST BE 0)`);
  t.diagnostic(`===============================================================\n`);

  // Assertions
  assert.equal(telemetry.totalFrames, TOTAL_FRAMES, 'All 10,000 frames must execute');
  assert.equal(telemetry.occlusionViolations, 0, 'HUD text must NEVER be occluded by hazard graphics or boss bodies');
  assert.equal(telemetry.nanOccurrences, 0, 'Zero NaN or infinite numerical drift allowed');
  assert.ok(telemetry.minDepthDeltaHudVsHazard >= 91.0, 'HUD text must maintain >= 91.0 depth clearance above hazards');
  assert.ok(telemetry.minDepthDeltaPhaseBarVsBoss >= 20.0, 'Boss Phase Bar must maintain >= 20.0 clearance above Boss Body');
  assert.ok(telemetry.minDepthDeltaFloatingVsBoss >= 80.0, 'Floating Text must maintain >= 80.0 clearance above Boss Body');
});
