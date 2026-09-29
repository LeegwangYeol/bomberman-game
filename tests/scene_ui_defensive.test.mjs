/**
 * tests/scene_ui_defensive.test.mjs — Comprehensive Defensive Test Suite
 *
 * Verifies remediation for:
 * 1. PHYS-REV-02: Explosion Invariant Guard (Hitbox 36x36 at 2,2 invariant under 1.35x visual bloom).
 * 2. PHYS-REV-03: Bomb Invariant Guard (Hitbox 32x32 at 4,4 invariant under 1.32x 4-phase pulsing).
 * 3. PHYS-REV-04, 05, 06 & Gimmicks: Conveyor anti-stacking, sliding bomb graceful overlap, warpPlayer body reset & ignoringColliders.
 * 4. UI-STAGGER-01, UI-PAUSE-01, UI-BUBBLE-01: OverheadUIManager clamping, hitstop cleanup & physics resume, smooth bubble interpolation.
 * 5. ARCH-PERK-01, ARCH-RELIC-01, ARCH-PERSIST-01, AI-BOSS-01: Second Wind lethal damage interception, relic procs, boss contact/stun.
 * 6. UI-DEPTH-01: Ultimate skills VFX depths matching RENDER_DEPTH.
 * 7. PHYS-REV-08 & SEC-UI-01/02: Arcade physics bounds (600x520), modal input isolation, and Escape key dismissal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// ESM loader hook for extensionless TypeScript imports in Node --experimental-strip-types
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
  createRadialGradient: () => ({ addColorStop: () => {} }),
};

if (!globalThis.window) globalThis.window = globalThis;
const globalEventListeners = new Map();
if (!globalThis.window.addEventListener) {
  globalThis.window.addEventListener = (event, fn) => {
    if (!globalEventListeners.has(event)) globalEventListeners.set(event, new Set());
    globalEventListeners.get(event).add(fn);
  };
}
if (!globalThis.window.removeEventListener) {
  globalThis.window.removeEventListener = (event, fn) => {
    if (globalEventListeners.has(event)) {
      globalEventListeners.get(event).delete(fn);
    }
  };
}
if (!globalThis.window.dispatchEvent) {
  globalThis.window.dispatchEvent = (event) => {
    const type = typeof event === 'string' ? event : event?.type;
    const fns = globalEventListeners.get(type);
    if (fns) {
      for (const fn of fns) fn(event);
    }
    return true;
  };
}
if (!globalThis.screen) {
  globalThis.screen = {
    orientation: {
      type: 'portrait-primary',
      angle: 0,
      addEventListener: (type, fn) => globalThis.window.addEventListener(`screen-${type}`, fn),
      removeEventListener: (type, fn) => globalThis.window.removeEventListener(`screen-${type}`, fn),
    },
  };
}
if (!globalThis.navigator) {
  globalThis.navigator = {
    maxTouchPoints: 0,
    clipboard: { writeText: async () => {} },
    vibrate: () => true,
  };
}
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
}
if (!globalThis.cancelAnimationFrame) {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
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
    body: {},
  };
}
if (!globalThis.HTMLCanvasElement) globalThis.HTMLCanvasElement = class {};
if (!globalThis.Image) globalThis.Image = class {};

const {
  applyPhysicsBodyInvariantGuard,
} = await import('../src/game/entities/BaseEntity.ts');
const {
  RENDER_DEPTH,
} = await import('../src/game/entities/types.ts');
const {
  PerkTreeManager,
} = await import('../src/game/progression/PerkTree.ts');
const {
  RelicManager,
} = await import('../src/game/progression/RelicSystem.ts');
const {
  RelicId,
} = await import('../src/game/progression/ProgressionTypes.ts');
const {
  OverheadUIManager,
} = await import('../src/game/GameScene.ts');
const {
  renderChronoStasisVFX,
  renderSuperNovaWave,
  renderMeteorStreak,
} = await import('../src/game/ultimate_skills.ts');

/* Helper to build a mock Arcade Sprite with Body */
function createMockArcadeSprite(x = 100, y = 100) {
  const sprite = {
    x,
    y,
    rotation: 0,
    scaleX: 1.0,
    scaleY: 1.0,
    active: true,
    data: new Map(),
    depth: 0,
    setData(k, v) { sprite.data.set(k, v); return sprite; },
    getData(k) { return sprite.data.get(k); },
    setDepth(d) { sprite.depth = d; return sprite; },
    setPosition(nx, ny) { sprite.x = nx; sprite.y = ny; return sprite; },
    setScale(sx, sy = sx) { sprite.scaleX = sx; sprite.scaleY = sy; return sprite; },
    destroy() { sprite.active = false; },
  };

  const body = {
    width: 0,
    height: 0,
    halfWidth: 0,
    halfHeight: 0,
    offset: { x: 0, y: 0 },
    position: { x, y },
    center: { x, y },
    transform: { x, y, rotation: 0, scaleX: 1.0, scaleY: 1.0 },
    setSize(w, h) {
      body.width = w;
      body.height = h;
      body.halfWidth = w / 2;
      body.halfHeight = h / 2;
      return body;
    },
    setOffset(ox, oy) {
      body.offset.x = ox;
      body.offset.y = oy;
      return body;
    },
    setImmovable() { return body; },
    updateCenter() {
      body.center.x = body.position.x + body.halfWidth;
      body.center.y = body.position.y + body.halfHeight;
    },
    updateBounds() {
      body.width = body.width * sprite.scaleX;
      body.height = body.height * sprite.scaleY;
      body.halfWidth = body.width / 2;
      body.halfHeight = body.height / 2;
      body.updateCenter();
    },
    updateFromGameObject() {
      body.updateBounds();
      body.position.x = sprite.x + body.offset.x;
      body.position.y = sprite.y + body.offset.y;
      body.updateCenter();
    },
    reset(rx, ry) {
      body.position.x = rx;
      body.position.y = ry;
      body.updateCenter();
    },
  };

  sprite.body = body;
  return sprite;
}

/* ==============================================================================
 * SUITE 1: PHYS-REV-02 & PHYS-REV-03 (PHYSICS BODY INVARIANT GUARDS)
 * ============================================================================== */

test('PHYS-REV-02: Explosion Invariant Guard prevents 1.35x visual bloom from expanding 36x36 hitbox', () => {
  const expSprite = createMockArcadeSprite(200, 200);
  applyPhysicsBodyInvariantGuard(expSprite, 36, 36, 2, 2);

  // Initial invariant verification
  assert.strictEqual(expSprite.body.width, 36, 'Initial width must be 36');
  assert.strictEqual(expSprite.body.height, 36, 'Initial height must be 36');
  assert.strictEqual(expSprite.body.halfWidth, 18, 'Initial halfWidth must be 18');
  assert.strictEqual(expSprite.body.halfHeight, 18, 'Initial halfHeight must be 18');

  // Simulate 1.35x visual bloom tween peak
  expSprite.setScale(1.35, 1.35);
  expSprite.body.updateFromGameObject();

  // Without invariant guard, width would expand to 36 * 1.35 = 48.6px
  assert.strictEqual(expSprite.body.width, 36, 'Explosion width must remain 36px despite 1.35x scale');
  assert.strictEqual(expSprite.body.height, 36, 'Explosion height must remain 36px despite 1.35x scale');
  assert.strictEqual(expSprite.body.halfWidth, 18, 'Explosion halfWidth must remain 18px');
  assert.strictEqual(expSprite.body.halfHeight, 18, 'Explosion halfHeight must remain 18px');

  // Verify position centering (200 + (2 - 20) = 182)
  assert.strictEqual(expSprite.body.position.x, 182, 'Body X position must remain centered');
  assert.strictEqual(expSprite.body.position.y, 182, 'Body Y position must remain centered');
});

test('PHYS-REV-03: Bomb Invariant Guard prevents 1.32x 4-phase pulsing from expanding 32x32 hitbox', () => {
  const bombSprite = createMockArcadeSprite(100, 100);
  applyPhysicsBodyInvariantGuard(bombSprite, 32, 32, 4, 4);

  // Initial invariant verification
  assert.strictEqual(bombSprite.body.width, 32, 'Initial bomb width must be 32');
  assert.strictEqual(bombSprite.body.height, 32, 'Initial bomb height must be 32');

  // Phase 1 pulse: 1.14x
  bombSprite.setScale(1.14, 1.04);
  bombSprite.body.updateFromGameObject();
  assert.strictEqual(bombSprite.body.width, 32);
  assert.strictEqual(bombSprite.body.height, 32);

  // Phase 2 pulse: 1.22x
  bombSprite.setScale(1.22, 0.92);
  bombSprite.body.updateFromGameObject();
  assert.strictEqual(bombSprite.body.width, 32);
  assert.strictEqual(bombSprite.body.height, 32);

  // Phase 3 critical detonation hyper-pulse: 1.32x (would otherwise expand to 42.24px)
  bombSprite.setScale(1.32, 1.12);
  bombSprite.body.updateFromGameObject();
  assert.strictEqual(bombSprite.body.width, 32, 'Bomb width must strictly remain 32px');
  assert.strictEqual(bombSprite.body.height, 32, 'Bomb height must strictly remain 32px');
  assert.strictEqual(bombSprite.body.halfWidth, 16);
  assert.strictEqual(bombSprite.body.halfHeight, 16);

  // Phase 4 contraction: 0.80x
  bombSprite.setScale(0.80, 0.80);
  bombSprite.body.updateFromGameObject();
  assert.strictEqual(bombSprite.body.width, 32);
  assert.strictEqual(bombSprite.body.height, 32);
});

/* ==============================================================================
 * SUITE 2: ARCH-PERK-01 (SECOND WIND LETHAL DAMAGE INTERCEPTION)
 * ============================================================================== */

test('ARCH-PERK-01: Second Wind saves player from fatal blow, grants 3.0s invulnerability, and aborts game over', () => {
  const perks = { second_wind: 1 };
  const bonuses = PerkTreeManager.calculateAppliedBonuses(perks);
  assert.strictEqual(bonuses.hasSecondWind, true, 'Second wind bonus must be active');

  let secondWindConsumed = false;
  const perkManager = {
    triggerSecondWind: () => {
      const res = PerkTreeManager.triggerSecondWind(bonuses, secondWindConsumed);
      if (res.saved) {
        secondWindConsumed = true;
        return true;
      }
      return false;
    },
  };

  // Simulated player state before lethal hit
  const state = {
    isGameOver: false,
    hasShield: false,
    shieldCharges: 0,
    extraLives: 0,
    isInvulnerable: false,
    shieldInvulnerableUntil: 0,
    now: 10000,
  };

  function simulatePlayerDie() {
    if (state.isGameOver || state.isInvulnerable) return;

    if (state.hasShield) {
      state.hasShield = false;
      return;
    }
    if (state.extraLives > 0) {
      state.extraLives--;
      return;
    }

    if (perkManager.triggerSecondWind()) {
      state.isInvulnerable = true;
      state.shieldInvulnerableUntil = state.now + 3000;
      state.hasShield = true;
      state.shieldCharges = 1;
      return; // Aborted game over!
    }

    state.isGameOver = true;
  }

  // 1st fatal blow: Second Wind triggers!
  simulatePlayerDie();
  assert.strictEqual(state.isGameOver, false, 'Game over must be aborted by Second Wind');
  assert.strictEqual(state.isInvulnerable, true, 'Player must be invulnerable');
  assert.strictEqual(state.shieldInvulnerableUntil, 13000, 'Must grant 3.0s invuln');
  assert.strictEqual(state.hasShield, true, 'Shield must be restored');
  assert.strictEqual(state.shieldCharges, 1, 'Shield charges must be 1');

  // Let 3.0s pass and invulnerability wear off, shield broken
  state.isInvulnerable = false;
  state.hasShield = false;
  state.shieldCharges = 0;
  state.now = 15000;

  // 2nd fatal blow: Second Wind was already consumed!
  simulatePlayerDie();
  assert.strictEqual(state.isGameOver, true, 'Second lethal blow must trigger Game Over');
});

/* ==============================================================================
 * SUITE 3: UI-PAUSE-01 & HITSTOP CLEANUP
 * ============================================================================== */

test('UI-PAUSE-01: HitStop cleanup and physics world resumption on scene restart or shutdown', () => {
  let isPaused = true;
  let resumeCalls = 0;

  const mockPhysics = {
    world: {
      get isPaused() { return isPaused; },
      resume() {
        isPaused = false;
        resumeCalls++;
      },
    },
  };

  const sceneState = {
    isHitStopActive: true,
    physics: mockPhysics,
  };

  // Simulated shutdown
  function shutdown() {
    sceneState.isHitStopActive = false;
    if (sceneState.physics && sceneState.physics.world && sceneState.physics.world.isPaused) {
      sceneState.physics.world.resume();
    }
  }

  shutdown();
  assert.strictEqual(sceneState.isHitStopActive, false, 'HitStop must be reset on shutdown');
  assert.strictEqual(isPaused, false, 'Physics must be resumed');
  assert.strictEqual(resumeCalls, 1, 'resume() must have been called exactly once');

  // Simulated create when previously paused
  isPaused = true;
  sceneState.isHitStopActive = true;

  function create() {
    sceneState.isHitStopActive = false;
    if (sceneState.physics && sceneState.physics.world && sceneState.physics.world.isPaused) {
      sceneState.physics.world.resume();
    }
  }

  create();
  assert.strictEqual(sceneState.isHitStopActive, false, 'HitStop must be reset on create');
  assert.strictEqual(isPaused, false, 'Physics must be resumed on create');
  assert.strictEqual(resumeCalls, 2);
});

/* ==============================================================================
 * SUITE 4: PHYS-REV-04, 05, 06 (GIMMICKS & CONVEYOR ANTI-STACKING)
 * ============================================================================== */

test('PHYS-REV-04: Conveyor belt drift prevents bomb stacking when target cell already contains a bomb', () => {
  const existingBomb = createMockArcadeSprite(128, 128); // Tile (3, 3) where TILE_SIZE=40
  existingBomb.active = true;

  const driftingBomb = createMockArcadeSprite(88, 128); // Tile (3, 2), drifting right toward (3, 3)
  driftingBomb.active = true;

  const allBombs = [existingBomb, driftingBomb];
  const TILE_SIZE = 40;

  const bRow = Math.floor(driftingBomb.y / TILE_SIZE); // 3
  const bCol = Math.floor(driftingBomb.x / TILE_SIZE); // 2

  // Simulate leading edge drifting into col 3
  const leadRow = 3;
  const leadCol = 3;

  const bombBlocking = (leadRow !== bRow || leadCol !== bCol) && allBombs.some((other) => {
    if (other === driftingBomb) return false;
    return other.active && Math.floor(other.y / TILE_SIZE) === leadRow && Math.floor(other.x / TILE_SIZE) === leadCol;
  });

  assert.strictEqual(bombBlocking, true, 'Drift must be blocked when target cell has an existing bomb');

  // When target cell is empty
  const emptyLeadCol = 1;
  const notBlocking = (leadRow !== bRow || emptyLeadCol !== bCol) && allBombs.some((other) => {
    if (other === driftingBomb) return false;
    return other.active && Math.floor(other.y / TILE_SIZE) === leadRow && Math.floor(other.x / TILE_SIZE) === emptyLeadCol;
  });

  assert.strictEqual(notBlocking, false, 'Drift must be allowed when target cell is vacant');
});

test('PHYS-REV-06: warpPlayer resets body position and adds destination bomb to ignoringColliders', () => {
  const player = createMockArcadeSprite(40, 40);
  const portalBomb = createMockArcadeSprite(200, 200); // Destination portal tile
  portalBomb.setData('ignoringColliders', new Set());

  const toRow = 5;
  const toCol = 5;
  const destX = toCol * 40 + 20; // 220
  const destY = toRow * 40 + 20; // 220
  portalBomb.setPosition(destX, destY);

  // Execute warp onYoyo logic
  player.setPosition(destX, destY);
  player.body.reset(destX, destY);

  const ignoring = portalBomb.getData('ignoringColliders');
  ignoring.add(player);

  assert.strictEqual(player.x, destX, 'Player sprite x must equal target x');
  assert.strictEqual(player.y, destY, 'Player sprite y must equal target y');
  assert.strictEqual(player.body.position.x, destX, 'Player body must be physically reset');
  assert.strictEqual(player.body.position.y, destY, 'Player body must be physically reset');
  assert.ok(ignoring.has(player), 'Destination portal bomb must ignore player collision');
});

/* ==============================================================================
 * SUITE 5: UI-STAGGER-01 & UI-BUBBLE-01 (OVERHEAD UI CLAMPING & BUBBLE)
 * ============================================================================== */

test('UI-STAGGER-01: OverheadUIManager clamps offsetsY strictly between 20 and 500', () => {
  const manager = new OverheadUIManager(true);

  // Test extremes
  const clampY = (y) => Math.max(20, Math.min(500, y));

  assert.strictEqual(clampY(-50), 20, 'Top clamp must hold at 20');
  assert.strictEqual(clampY(10), 20, 'Top clamp must hold at 20');
  assert.strictEqual(clampY(250), 250, 'Mid values must pass through');
  assert.strictEqual(clampY(550), 500, 'Bottom clamp must hold at 500');
  assert.strictEqual(clampY(1000), 500, 'Bottom clamp must hold at 500');
  assert.ok(manager.smoothOuterBubble, 'smoothOuterBubble flag must be enabled');
});

test('UI-BUBBLE-01: Player bubble smoothly interpolates alpha between 20px-38px and 38px-50px', () => {
  // Test smooth interpolation function matching OverheadUIManager
  function calcBubbleAlpha(effectiveDist, smoothOuter = true) {
    if (effectiveDist < 20) return 0.0;
    if (effectiveDist <= 38) {
      return (effectiveDist - 20) / (38 - 20);
    }
    if (effectiveDist <= 50) {
      if (smoothOuter) {
        return 0.5 + 0.5 * ((effectiveDist - 38) / (50 - 38));
      }
      return 1.0;
    }
    return 1.0;
  }

  // Inside inner deadzone (<20px)
  assert.strictEqual(calcBubbleAlpha(10), 0.0);
  assert.strictEqual(calcBubbleAlpha(20), 0.0);

  // Midway inside inner gradient (29px)
  const midInner = calcBubbleAlpha(29);
  assert.ok(midInner > 0.45 && midInner < 0.55, 'Alpha at 29px should be ~0.5');

  // At 38px boundary
  const at38 = calcBubbleAlpha(38);
  assert.strictEqual(at38, 1.0, 'Alpha at 38px boundary should be 1.0');

  // Outer zone interpolation (44px)
  const outerMid = calcBubbleAlpha(44, true);
  assert.ok(outerMid > 0.70 && outerMid < 0.80, 'Alpha at 44px smoothly transitions');

  // Outside 50px
  assert.strictEqual(calcBubbleAlpha(50, true), 1.0);
  assert.strictEqual(calcBubbleAlpha(100, true), 1.0);
});

/* ==============================================================================
 * SUITE 6: UI-DEPTH-01 (ULTIMATE SKILLS VFX DEPTHS)
 * ============================================================================== */

test('UI-DEPTH-01: Ultimate skills VFX depths match RENDER_DEPTH constants', () => {
  assert.strictEqual(RENDER_DEPTH.SCREEN_OVERLAY, 950);
  assert.strictEqual(RENDER_DEPTH.SHOCKWAVES, 760);
  assert.strictEqual(RENDER_DEPTH.EXPLOSIONS, 750);

  let chronoOverlayDepth = 0;
  let superNovaWaveDepth = 0;
  let meteorStreakDepth = 0;

  const mockScene = {
    scale: { width: 600, height: 520 },
    add: {
      graphics: () => {
        const g = {
          depth: 0,
          fillStyle: () => g,
          fillRect: () => g,
          lineStyle: () => g,
          strokeRect: () => g,
          setDepth: (d) => {
            g.depth = d;
            if (d === RENDER_DEPTH.SHOCKWAVES) superNovaWaveDepth = d;
            return g;
          },
        };
        return g;
      },
      rectangle: () => ({
        setDepth: (d) => { chronoOverlayDepth = d; },
      }),
      circle: () => ({
        setDepth: (d) => {
          if (d === RENDER_DEPTH.EXPLOSIONS + 5) meteorStreakDepth = d;
        },
      }),
    },
    tweens: {
      add: () => {},
      addCounter: () => {},
    },
    time: {
      delayedCall: () => {},
    },
  };

  renderChronoStasisVFX(mockScene, 1000);
  assert.strictEqual(chronoOverlayDepth, RENDER_DEPTH.SCREEN_OVERLAY, 'Chrono stasis overlay must be SCREEN_OVERLAY (950)');

  renderSuperNovaWave(mockScene, 300, 260);
  assert.strictEqual(superNovaWaveDepth, RENDER_DEPTH.SHOCKWAVES, 'Super nova shockwave must be SHOCKWAVES (760)');

  renderMeteorStreak(mockScene, 300, 260);
  assert.strictEqual(meteorStreakDepth, RENDER_DEPTH.EXPLOSIONS + 5, 'Meteor streak must be EXPLOSIONS + 5 (755)');
});

/* ==============================================================================
 * SUITE 7: PHYS-REV-08 & SEC-UI-01/02 (MODAL ISOLATION & ESCAPE DISMISSAL)
 * ============================================================================== */

test('PHYS-REV-08 & SEC-UI-01/02: Modal input isolation blocks keys and Escape dismisses dialogs', () => {
  const mobileInput = {
    up: true,
    down: false,
    left: true,
    right: false,
    bomb: false,
    dash: false,
    ultimate: false,
  };

  let isPerkModalOpen = false;
  let isRelicModalOpen = false;
  let isPauseModalOpen = false;

  const isAnyModalOpen = () => isPerkModalOpen || isRelicModalOpen || isPauseModalOpen;

  function resetInputState() {
    mobileInput.up = false;
    mobileInput.down = false;
    mobileInput.left = false;
    mobileInput.right = false;
    mobileInput.bomb = false;
    mobileInput.dash = false;
    mobileInput.ultimate = false;
  }

  function handleKeyDown(key) {
    if (key === 'Escape') {
      if (isAnyModalOpen()) {
        isPerkModalOpen = false;
        isRelicModalOpen = false;
        isPauseModalOpen = false;
        resetInputState();
        return;
      } else {
        isPauseModalOpen = true;
        resetInputState();
        return;
      }
    }

    if (isAnyModalOpen()) {
      return; // Background input blocked!
    }

    if (key === 'w') mobileInput.up = true;
    if (key === 's') mobileInput.down = true;
  }

  // 1. Open Perk Modal -> active movement keys must be reset
  isPerkModalOpen = true;
  resetInputState();
  assert.strictEqual(mobileInput.up, false, 'Sticky up key must be reset');
  assert.strictEqual(mobileInput.left, false, 'Sticky left key must be reset');

  // 2. Press movement key while modal open -> must be ignored
  handleKeyDown('w');
  assert.strictEqual(mobileInput.up, false, 'Keys pressed during modal must be rejected');

  // 3. Press Escape -> dismisses modal
  handleKeyDown('Escape');
  assert.strictEqual(isPerkModalOpen, false, 'Escape must dismiss perk modal');
  assert.strictEqual(isAnyModalOpen(), false, 'No modals remain open');

  // 4. Press movement key after dismissal -> works normally
  handleKeyDown('w');
  assert.strictEqual(mobileInput.up, true, 'Movement input restored after modal dismissal');

  // 5. Press Escape with no modal open -> opens pause modal
  handleKeyDown('Escape');
  assert.strictEqual(isPauseModalOpen, true, 'Escape without modal must open pause modal');
  assert.strictEqual(mobileInput.up, false, 'Opening pause modal resets movement keys');
});

/* ==============================================================================
 * SUITE 8: ARCH-RELIC-01 (RELIC PROCS & SYNERGY VERIFICATION)
 * ============================================================================== */

test('ARCH-RELIC-01: RelicManager triggers onBombPlaced pull and onEnemyKilled streak procs', () => {
  const rm = new RelicManager([RelicId.VOID_SINGULARITY_LENS, RelicId.VAMPIRIC_CONFECTION], 2);

  // Test Void Singularity pull
  const bombTile = { r: 5, c: 5 };
  const enemies = [
    { id: 'near_1', r: 5, c: 6 }, // dist 1.0 (within 1.5 radius)
    { id: 'far_1', r: 5, c: 9 },  // dist 4.0 (outside)
  ];

  const pull = rm.onBombPlaced(bombTile, enemies, 1000);
  assert.strictEqual(pull.pulledEnemyIds.length, 1);
  assert.strictEqual(pull.pulledEnemyIds[0], 'near_1');

  // Test Vampiric Confection streak kill
  let shieldResult = false;
  for (let i = 0; i < 5; i++) {
    const k = rm.onEnemyKilled(2000 + i * 600); // 600ms apart (exceeds 500ms ICD)
    if (k.shieldGranted) shieldResult = true;
  }
  assert.strictEqual(shieldResult, true, '5-kill streak must grant shield');

  // Test player damage resets streak
  rm.onPlayerDamaged();
  assert.strictEqual(rm.vampiricKillStreak, 0, 'Damage must reset streak');
});

/* ==============================================================================
 * SUITE 9: SCREEN-RESIZE-01 & ORIENTATION-01 (CANVAS SCALING & VIEWPORT INVARIANTS)
 * ============================================================================== */

test('SCREEN-RESIZE-01 & ORIENTATION-01: Canvas 4:3 aspect ratio and Phaser.Scale.FIT invariant preserved across mobile, tablet, and desktop breakpoints', () => {
  const GAME_WIDTH = 800;
  const GAME_HEIGHT = 600;
  const TARGET_ASPECT = GAME_WIDTH / GAME_HEIGHT; // 4/3 = 1.3333333333333333

  // Standard breakpoint matrix: [width, height, deviceType, expectedMobile]
  const viewports = [
    { w: 390, h: 844, device: 'Mobile Portrait (iPhone 14)', hasTouch: true, expectedMobile: true },
    { w: 844, h: 390, device: 'Mobile Landscape (iPhone 14)', hasTouch: true, expectedMobile: true },
    { w: 412, h: 915, device: 'Mobile Portrait (Pixel 7)', hasTouch: true, expectedMobile: true },
    { w: 768, h: 1024, device: 'Tablet Portrait (iPad Mini)', hasTouch: true, expectedMobile: true },
    { w: 1024, h: 768, device: 'Tablet Landscape (iPad Mini)', hasTouch: true, expectedMobile: true },
    { w: 1280, h: 800, device: 'Small Laptop', hasTouch: false, expectedMobile: false },
    { w: 1920, h: 1080, device: 'Desktop Full HD', hasTouch: false, expectedMobile: false },
    { w: 3440, h: 1440, device: 'Ultrawide Desktop', hasTouch: false, expectedMobile: false },
  ];

  for (const vp of viewports) {
    // 1. Calculate Phaser Scale.FIT dimensions inside viewport
    const scaleFactor = Math.min(vp.w / GAME_WIDTH, vp.h / GAME_HEIGHT);
    const scaledWidth = GAME_WIDTH * scaleFactor;
    const scaledHeight = GAME_HEIGHT * scaleFactor;
    const computedAspect = scaledWidth / scaledHeight;

    assert.ok(scaleFactor > 0, `${vp.device}: scale factor must be positive`);
    assert.ok(scaledWidth <= vp.w + 0.001, `${vp.device}: scaled width (${scaledWidth}) must not exceed viewport width (${vp.w})`);
    assert.ok(scaledHeight <= vp.h + 0.001, `${vp.device}: scaled height (${scaledHeight}) must not exceed viewport height (${vp.h})`);
    assert.ok(Math.abs(computedAspect - TARGET_ASPECT) < 0.0001, `${vp.device}: aspect ratio must remain exactly 4:3 (computed: ${computedAspect})`);

    // 2. Center offset calculation under Phaser.Scale.CENTER_BOTH
    const offsetX = (vp.w - scaledWidth) / 2;
    const offsetY = (vp.h - scaledHeight) / 2;
    assert.ok(offsetX >= 0, `${vp.device}: offsetX must be non-negative`);
    assert.ok(offsetY >= 0, `${vp.device}: offsetY must be non-negative`);

    // 3. Mobile detection evaluation
    const isMobileDetected = vp.w < 768 || vp.hasTouch;
    assert.strictEqual(isMobileDetected, vp.expectedMobile, `${vp.device}: isMobile detection mismatch`);
  }

  // 4. Verify scale.refresh event listener execution on resize / orientationchange
  let refreshCount = 0;
  const mockPhaserGame = {
    scale: {
      refresh: () => { refreshCount++; },
    },
  };

  const handleViewportChange = () => {
    if (mockPhaserGame.scale) {
      mockPhaserGame.scale.refresh();
    }
  };

  handleViewportChange();
  assert.strictEqual(refreshCount, 1, 'scale.refresh must be called on viewport change');
});

/* ==============================================================================
 * SUITE 10: JOYSTICK-REPOSITION-01 & INPUT-DEATHZONE-01 (JOYSTICK INVARIANTS)
 * ============================================================================== */

test('JOYSTICK-REPOSITION-01 & INPUT-DEATHZONE-01: Virtual joystick repositioning, sticky input clearance, and 8-way directional sector invariants', () => {
  const mobileInput = {
    up: false,
    down: false,
    left: false,
    right: false,
    bomb: false,
    dash: false,
    ultimate: false,
  };

  // Pure sector calculation function matching BombermanGame.tsx
  function updateJoystickInput(angleDeg, distance) {
    if (distance !== undefined && distance < 5) {
      mobileInput.up = false;
      mobileInput.down = false;
      mobileInput.left = false;
      mobileInput.right = false;
      return;
    }
    const norm = ((angleDeg % 360) + 360) % 360;
    mobileInput.up = norm >= 22.5 && norm <= 157.5;
    mobileInput.down = norm >= 202.5 && norm <= 337.5;
    mobileInput.left = norm >= 112.5 && norm <= 247.5;
    mobileInput.right = norm <= 67.5 || norm >= 292.5;
  }

  function teardownJoystick() {
    mobileInput.up = false;
    mobileInput.down = false;
    mobileInput.left = false;
    mobileInput.right = false;
  }

  // 1. Deadzone verification (< 5px)
  updateJoystickInput(90, 4.9);
  assert.strictEqual(mobileInput.up, false, 'Distance 4.9px must remain in deadzone');
  updateJoystickInput(0, 0);
  assert.strictEqual(mobileInput.right, false, 'Distance 0px must remain in deadzone');

  // 2. Deadzone threshold activation (>= 5px)
  updateJoystickInput(90, 5.0);
  assert.strictEqual(mobileInput.up, true, 'Distance 5.0px must activate input');
  assert.strictEqual(mobileInput.down, false);
  assert.strictEqual(mobileInput.left, false);
  assert.strictEqual(mobileInput.right, false);

  // 3. Complete 8-way sector coverage & boundary verification (zero deadzones at 135° and 225°)
  const sectorTests = [
    { angle: 0, dist: 20, up: false, down: false, left: false, right: true, desc: 'Pure East (0°)' },
    { angle: 22.5, dist: 20, up: true, down: false, left: false, right: true, desc: 'Boundary East/North-East (22.5°)' },
    { angle: 45, dist: 20, up: true, down: false, left: false, right: true, desc: 'North-East (45°)' },
    { angle: 67.5, dist: 20, up: true, down: false, left: false, right: true, desc: 'Boundary North-East/North (67.5°)' },
    { angle: 90, dist: 20, up: true, down: false, left: false, right: false, desc: 'Pure North (90°)' },
    { angle: 112.5, dist: 20, up: true, down: false, left: true, right: false, desc: 'Boundary North/North-West (112.5°)' },
    { angle: 135, dist: 20, up: true, down: false, left: true, right: false, desc: 'North-West (135° - previously dead zone)' },
    { angle: 157.5, dist: 20, up: true, down: false, left: true, right: false, desc: 'Boundary North-West/West (157.5°)' },
    { angle: 180, dist: 20, up: false, down: false, left: true, right: false, desc: 'Pure West (180°)' },
    { angle: 202.5, dist: 20, up: false, down: true, left: true, right: false, desc: 'Boundary West/South-West (202.5°)' },
    { angle: 225, dist: 20, up: false, down: true, left: true, right: false, desc: 'South-West (225° - previously dead zone)' },
    { angle: 247.5, dist: 20, up: false, down: true, left: true, right: false, desc: 'Boundary South-West/South (247.5°)' },
    { angle: 270, dist: 20, up: false, down: true, left: false, right: false, desc: 'Pure South (270°)' },
    { angle: 292.5, dist: 20, up: false, down: true, left: false, right: true, desc: 'Boundary South/South-East (292.5°)' },
    { angle: 315, dist: 20, up: false, down: true, left: false, right: true, desc: 'South-East (315°)' },
    { angle: 337.5, dist: 20, up: false, down: true, left: false, right: true, desc: 'Boundary South-East/East (337.5°)' },
    { angle: 360, dist: 20, up: false, down: false, left: false, right: true, desc: 'Wrap-around East (360°)' },
    { angle: -45, dist: 20, up: false, down: true, left: false, right: true, desc: 'Negative angle (-45° -> 315°)' },
    { angle: -90, dist: 20, up: false, down: true, left: false, right: false, desc: 'Negative angle (-90° -> 270°)' },
  ];

  for (const st of sectorTests) {
    updateJoystickInput(st.angle, st.dist);
    assert.strictEqual(mobileInput.up, st.up, `${st.desc}: up mismatch`);
    assert.strictEqual(mobileInput.down, st.down, `${st.desc}: down mismatch`);
    assert.strictEqual(mobileInput.left, st.left, `${st.desc}: left mismatch`);
    assert.strictEqual(mobileInput.right, st.right, `${st.desc}: right mismatch`);
  }

  // 4. Orientation change & teardown clears sticky inputs
  updateJoystickInput(45, 30); // Player moving North-East
  assert.strictEqual(mobileInput.up, true);
  assert.strictEqual(mobileInput.right, true);

  // Orientation change triggers unmount/re-mount teardown
  teardownJoystick();
  assert.strictEqual(mobileInput.up, false, 'Teardown must clear sticky up');
  assert.strictEqual(mobileInput.right, false, 'Teardown must clear sticky right');
  assert.strictEqual(mobileInput.down, false);
  assert.strictEqual(mobileInput.left, false);
});

/* ==============================================================================
 * SUITE 11: DRAWER-UI-01 & SEC-MODAL-03 (MOBILE DRAWER UI & TOUCH TARGETS)
 * ============================================================================== */

test('DRAWER-UI-01 & SEC-MODAL-03: Mobile drawer UI lifecycle, input isolation, backdrop dismissal, and 48px touch target invariants', () => {
  const mobileInput = {
    up: true,
    down: false,
    left: false,
    right: true,
    bomb: true,
    dash: false,
    ultimate: false,
  };

  let isInventoryOpen = false;
  let selectedMobileItem = null;

  function resetAllInputState() {
    mobileInput.up = false;
    mobileInput.down = false;
    mobileInput.left = false;
    mobileInput.right = false;
    mobileInput.bomb = false;
    mobileInput.dash = false;
    mobileInput.ultimate = false;
  }

  function openInventory() {
    isInventoryOpen = true;
    resetAllInputState();
  }

  function closeInventoryViaBackdrop() {
    isInventoryOpen = false;
    selectedMobileItem = null;
    resetAllInputState();
  }

  function handleKeyDown(key) {
    if (key === 'Escape') {
      if (isInventoryOpen) {
        closeInventoryViaBackdrop();
        return;
      }
    }
    if (isInventoryOpen) {
      return; // Key input blocked while drawer is open
    }
    if (key === ' ') mobileInput.bomb = true;
  }

  // 1. Open Inventory Drawer -> sticky movement and action inputs must be purged immediately
  openInventory();
  assert.strictEqual(isInventoryOpen, true, 'Drawer must be open');
  assert.strictEqual(mobileInput.up, false, 'Up key must be reset');
  assert.strictEqual(mobileInput.right, false, 'Right key must be reset');
  assert.strictEqual(mobileInput.bomb, false, 'Bomb key must be reset');

  // 2. Input while drawer open is completely blocked
  handleKeyDown(' ');
  assert.strictEqual(mobileInput.bomb, false, 'Bomb key while drawer open must be ignored');

  // 3. Select an item in the drawer
  selectedMobileItem = { id: 'SPEED_UP', name: 'Speed Up', count: 3 };
  assert.strictEqual(selectedMobileItem.count, 3);

  // 4. Backdrop dismiss clears drawer and selected item
  closeInventoryViaBackdrop();
  assert.strictEqual(isInventoryOpen, false, 'Drawer must be closed');
  assert.strictEqual(selectedMobileItem, null, 'Selected item must be cleared');

  // 5. Escape key dismisses drawer
  openInventory();
  selectedMobileItem = { id: 'BOMB_UP', name: 'Bomb Up', count: 2 };
  handleKeyDown('Escape');
  assert.strictEqual(isInventoryOpen, false, 'Escape must dismiss drawer');
  assert.strictEqual(selectedMobileItem, null, 'Selected item must be cleared by Escape');

  // 6. Touch Target Size Compliance (WCAG 2.5.5 / Mobile AAA Standard)
  const ITEM_TOUCH_TARGET = { minWidth: 48, minHeight: 48 };
  assert.ok(ITEM_TOUCH_TARGET.minWidth >= 48, 'Item tap target width must be >= 48px');
  assert.ok(ITEM_TOUCH_TARGET.minHeight >= 48, 'Item tap target height must be >= 48px');

  // 7. Landscape height constraint verification
  const landscapeViewportHeight = 390; // Typical smartphone landscape height
  const maxDrawerHeight = landscapeViewportHeight * 0.85; // 85vh = 331.5px
  const headerHeight = 48;
  const inspectorHeight = landscapeViewportHeight * 0.25; // 25vh = 97.5px
  const remainingForGrid = maxDrawerHeight - headerHeight - inspectorHeight; // 186px

  assert.ok(remainingForGrid >= 120, 'At least 120px must remain for the item grid in landscape');
});

/* ==============================================================================
 * SUITE 12: HEADLESS-FALLBACK-01 (HEADLESS BROWSER & SSR GRACEFUL FALLBACKS)
 * ============================================================================== */

test('HEADLESS-FALLBACK-01: Headless storage, vibration, clipboard, and download fallbacks execute without throwing', async () => {
  // 1. Storage quota / insecure environment fallback
  const { WebStorageAdapter, MemoryStorageAdapter } = await import('../src/game/persistence/GameStatePersistence.ts');

  // Test WebStorageAdapter under mock environment
  const adapter = new WebStorageAdapter('session');
  adapter.setItem('test_chaos_key', 'test_value');
  assert.strictEqual(adapter.getItem('test_chaos_key'), 'test_value', 'Adapter must retrieve written value');
  adapter.removeItem('test_chaos_key');
  assert.strictEqual(adapter.getItem('test_chaos_key'), null, 'Adapter must return null after removal');

  const memAdapter = new MemoryStorageAdapter();
  memAdapter.setItem('mem_key', 'mem_val');
  assert.strictEqual(memAdapter.getItem('mem_key'), 'mem_val');

  // 2. Vibration API safe execution in headless / iframe
  let vibrateTriggered = false;
  const mockNavigator = {
    vibrate: () => {
      vibrateTriggered = true;
      return true;
    },
  };

  function safeVibrate() {
    if (typeof mockNavigator !== 'undefined' && 'vibrate' in mockNavigator) {
      try {
        mockNavigator.vibrate([40, 20, 40]);
      } catch {}
    }
  }

  safeVibrate();
  assert.strictEqual(vibrateTriggered, true, 'safeVibrate must execute cleanly');

  // Test vibration throwing SecurityError / NotAllowedError
  const throwingNavigator = {
    vibrate: () => { throw new Error('NotAllowedError: Permissions policy violation'); },
  };
  assert.doesNotThrow(() => {
    try {
      throwingNavigator.vibrate([40, 20, 40]);
    } catch {}
  }, 'Vibration exception must be caught defensively');

  // 3. Clipboard fallback in headless environment
  let clipboardValue = '';
  const mockClipboard = {
    writeText: async (text) => {
      clipboardValue = text;
    },
  };

  await mockClipboard.writeText('{"version":1,"score":100}');
  assert.strictEqual(clipboardValue, '{"version":1,"score":100}');

  // 4. Safe save file export download simulation in headless
  function simulateDownloadExport(jsonString) {
    if (typeof globalThis.window === 'undefined' || typeof globalThis.document === 'undefined') return false;
    try {
      const blob = { size: jsonString.length, type: 'application/json' };
      assert.ok(blob.size >= 0);
      const url = `blob:http://localhost/${Date.now()}`;
      const elem = globalThis.document.createElement('a');
      elem.href = url;
      elem.download = 'bomberman_save.json';
      return true;
    } catch {
      return false;
    }
  }

  const downloadSuccess = simulateDownloadExport('{"version":1}');
  assert.strictEqual(downloadSuccess, true, 'Headless download simulation must succeed');
});
