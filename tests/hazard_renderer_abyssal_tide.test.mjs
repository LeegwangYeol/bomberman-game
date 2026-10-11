import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HazardRenderer,
} from '../src/game/hazards/HazardRenderer.ts';
import {
  AbyssalHazard,
  AbyssalLifecycleState,
  AbyssalTelegraphPhase,
  AbyssalDangerValue,
  DURATION_TIDAL_UNDERTOW_MS,
  DURATION_TRENCH_CONVERGENCE_MS,
  DURATION_TIDAL_SURGE_MS,
} from '../src/game/hazards/AbyssalHazard.ts';

class MockGraphics {
  constructor() {
    this.fills = [];
    this.strokes = [];
    this.rects = [];
    this.circles = [];
    this.cleared = false;
  }

  clear() {
    this.cleared = true;
    this.fills = [];
    this.strokes = [];
    this.rects = [];
    this.circles = [];
  }

  fillStyle(color, alpha) {
    this.fills.push({ color, alpha });
  }

  lineStyle(lineWidth, color, alpha) {
    this.strokes.push({ lineWidth, color, alpha });
  }

  fillRect(x, y, width, height) {
    this.rects.push({ type: 'fill', x, y, width, height });
  }

  strokeRect(x, y, width, height) {
    this.rects.push({ type: 'stroke', x, y, width, height });
  }

  strokeCircle(x, y, radius) {
    this.circles.push({ type: 'stroke', x, y, radius });
  }

  fillCircle(x, y, radius) {
    this.circles.push({ type: 'fill', x, y, radius });
  }
}

test('HazardRenderer [Headless & SSR Safety]: returns gracefully on null or undefined arguments', () => {
  assert.doesNotThrow(() => {
    HazardRenderer.render(null, {}, 0);
    HazardRenderer.render(undefined, {}, 0);
    HazardRenderer.renderAbyssalTide(null, null, 0);
    HazardRenderer.renderAbyssalTide(undefined, undefined, 0);
  });
});

test('HazardRenderer.renderAbyssalTide [Dormant & Oceanic Calm]: produces zero draw calls when inactive', () => {
  const graphics = new MockGraphics();
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);

  // 1. Dormant state
  assert.equal(hazard.getState(), AbyssalLifecycleState.DORMANT);
  HazardRenderer.renderAbyssalTide(graphics, hazard, 1000);
  assert.equal(graphics.fills.length, 0);
  assert.equal(graphics.strokes.length, 0);

  // 2. Oceanic Calm cooldown state
  hazard.start('NORMAL', 6, 7);
  hazard.update(DURATION_TIDAL_SURGE_MS + 50); // Transitions to ABYSSAL_MAELSTROM
  hazard.update(350 + 50); // Transitions to OCEANIC_CALM
  assert.equal(hazard.getState(), AbyssalLifecycleState.OCEANIC_CALM);
  HazardRenderer.renderAbyssalTide(graphics, hazard, 1000);
  assert.equal(graphics.fills.length, 0);
  assert.equal(graphics.strokes.length, 0);
});

test('HazardRenderer.renderAbyssalTide [Strict Alpha Clamping]: telegraph fill alpha strictly bounded [0.18, 0.40]', () => {
  const graphics = new MockGraphics();
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);

  // Phase 1: TIDAL_UNDERTOW (0ms)
  hazard.start('NORMAL', 6, 7);
  assert.equal(hazard.getTelegraphPhase(), AbyssalTelegraphPhase.TIDAL_UNDERTOW);
  HazardRenderer.renderAbyssalTide(graphics, hazard, 500);

  assert.ok(graphics.fills.length > 0, 'Must produce fill operations during TIDAL_UNDERTOW');
  for (const fill of graphics.fills) {
    assert.ok(
      fill.alpha >= 0.18 - 1e-6 && fill.alpha <= 0.40 + 1e-6,
      `Telegraph alpha ${fill.alpha} must be strictly clamped within [0.18, 0.40]`
    );
  }

  // Phase 2: TRENCH_CONVERGENCE (1200ms)
  graphics.clear();
  hazard.update(DURATION_TIDAL_UNDERTOW_MS + 200);
  assert.equal(hazard.getTelegraphPhase(), AbyssalTelegraphPhase.TRENCH_CONVERGENCE);
  HazardRenderer.renderAbyssalTide(graphics, hazard, 1200);

  assert.ok(graphics.fills.length > 0, 'Must produce fill operations during TRENCH_CONVERGENCE');
  for (const fill of graphics.fills) {
    assert.ok(
      fill.alpha >= 0.18 - 1e-6 && fill.alpha <= 0.40 + 1e-6,
      `Telegraph alpha ${fill.alpha} must be strictly clamped within [0.18, 0.40]`
    );
  }

  // Phase 3: MAELSTROM_IMMINENT (1800ms)
  graphics.clear();
  hazard.update(DURATION_TRENCH_CONVERGENCE_MS);
  assert.equal(hazard.getTelegraphPhase(), AbyssalTelegraphPhase.MAELSTROM_IMMINENT);
  HazardRenderer.renderAbyssalTide(graphics, hazard, 1800);

  assert.ok(graphics.fills.length > 0, 'Must produce fill operations during MAELSTROM_IMMINENT');
  for (const fill of graphics.fills) {
    assert.ok(
      fill.alpha >= 0.18 - 1e-6 && fill.alpha <= 0.40 + 1e-6,
      `Telegraph alpha ${fill.alpha} must be strictly clamped within [0.18, 0.40]`
    );
  }
});

test('HazardRenderer.renderAbyssalTide [Palette Verification]: uses deep azure (0x0284c7), ocean cyan (0x0ea5e9), and abyssal navy (0x082f49)', () => {
  const graphics = new MockGraphics();
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);

  // 1. Telegraph stage uses deep azure (0x0284c7) fill and ocean cyan (0x0ea5e9) pip
  hazard.start('NORMAL', 6, 7);
  HazardRenderer.renderAbyssalTide(graphics, hazard, 500);

  const fillColors = new Set(graphics.fills.map((f) => f.color));
  const strokeColors = new Set(graphics.strokes.map((s) => s.color));

  assert.ok(fillColors.has(0x0284c7), 'Must use deep azure (0x0284c7) for telegraph fill');
  assert.ok(strokeColors.has(0x0ea5e9), 'Must use ocean cyan (0x0ea5e9) for vortex stroke');
  assert.ok(strokeColors.has(0x082f49), 'Must use abyssal navy (0x082f49) for perimeter outline');

  // 2. Maelstrom Collapse stage uses abyssal navy core (0x082f49) and pulsing ocean cyan rim (0x0ea5e9)
  graphics.clear();
  hazard.update(DURATION_TIDAL_SURGE_MS + 20); // Advance to ABYSSAL_MAELSTROM
  assert.equal(hazard.getState(), AbyssalLifecycleState.ABYSSAL_MAELSTROM);
  HazardRenderer.renderAbyssalTide(graphics, hazard, 2100);

  const maelstromFills = new Set(graphics.fills.map((f) => f.color));
  const maelstromStrokes = new Set(graphics.strokes.map((s) => s.color));
  assert.ok(maelstromFills.has(0x082f49), 'Must use abyssal navy (0x082f49) for maelstrom core');
  assert.ok(maelstromStrokes.has(0x0ea5e9), 'Must use ocean cyan (0x0ea5e9) for pulsing rim');

  // 3. Hydro-Calm Anchor stage uses ocean cyan field (0x0ea5e9) and deep azure border (0x0284c7)
  graphics.clear();
  hazard.start('NORMAL', 6, 7);
  hazard.onBombBlastImpact(6, 7); // Cleanse center tile to ANCHOR
  HazardRenderer.renderAbyssalTide(graphics, hazard, 500);

  const anchorFills = new Set(graphics.fills.map((f) => f.color));
  const anchorStrokes = new Set(graphics.strokes.map((s) => s.color));
  assert.ok(anchorFills.has(0x0ea5e9), 'Must use ocean cyan (0x0ea5e9) for calm sanctuary field');
  assert.ok(anchorStrokes.has(0x0284c7), 'Must use deep azure (0x0284c7) for calm sanctuary border');
});

test('HazardRenderer.render [Context Integration]: dispatches to renderAbyssalTide via context.abyssalHazard', () => {
  const graphics = new MockGraphics();
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const context = {
    abyssalHazard: hazard,
  };

  HazardRenderer.render(graphics, context, 100);

  assert.equal(graphics.cleared, true, 'Graphics should be cleared at start of batch');
  assert.ok(graphics.fills.length > 0, 'Draw operations should have occurred for active abyssal hazard');
});
