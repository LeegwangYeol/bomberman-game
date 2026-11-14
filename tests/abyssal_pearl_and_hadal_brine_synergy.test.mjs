/**
 * tests/abyssal_pearl_and_hadal_brine_synergy.test.mjs
 *
 * Comprehensive 12-Tier Regression & Creative Expansion Suite for Cycle 38:
 * 1. 15th Equippable Epic Relic: ABYSSAL_MAELSTROM_PEARL ('abyssal_maelstrom_pearl')
 * 2. 11th Epic Synergy: 'Hadal Brine Maelstrom' (ABYSSAL_MAELSTROM_PEARL + CORROSIVE_MIASMIC_FLASK)
 * 3. 105 Exhaustive Pairwise Combinations Matrix (C(15, 2) = 105) & Reciprocal Graph Integrity
 * 4. Standalone Tidal Maelstrom vs. Hadal Brine Maelstrom Combat Math & Nearest-Target Selection
 * 5. 500ms ICD, Clock Rollback, Negative Timestamp, & Pre-ICD Malformed Input Non-Consumption Guards
 * 6. Live GameScene Runtime Integration: 2-Slot Perk Sync + explodeBomb Pull/Damage/Slow/Stun/Score
 * 7. OverheadUI Inactive Destroy Pool Reclamation & OverheadUIManager Symmetric Staggering
 * 8. Cross-Hazard Mastery Speed Burst Non-Compounding & Stomp Slow Delta Harmony
 * 9. GravityHazard Inactive Pooled Bomb Immunity & Cosmic Fusion Merger
 * 10. CrisisManager One-Shot Failure Guard & OrbitalCrisis Zero-Duration NaN Defense
 * 11. SteamToyTitanBoss Shockwave Pool Release, Input Watchdog Desktop Safety, & Kick Fuzz Guards
 * 12. 10,000-Frame Zero-GC Soak Test (Zero Scratch Reference Allocation & Bounded Heap)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

EventEmitter.defaultMaxListeners = 500;

const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'ERR_UNSUPPORTED_DIR_IMPORT') {
      for (const ext of ['.ts', '.js', '/index.ts', '/index.js']) {
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
if (!globalThis.HTMLCanvasElement) globalThis.HTMLCanvasElement = class {};
if (!globalThis.Image) globalThis.Image = class {};
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

const { RelicId } = await import('../src/game/progression/ProgressionTypes.ts');
const { CrisisStage, CrisisType } = await import('../src/game/crises/CrisisTypes.ts');
const {
  RELIC_CATALOG,
  SYNERGY_DEFINITIONS,
  RelicManager,
} = await import('../src/game/progression/RelicSystem.ts');
const { ScalingEngine } = await import('../src/game/progression/ScalingEngine.ts');
const { OverheadUI } = await import('../src/game/entities/OverheadUI.ts');
const { OverheadUIManager } = await import('../src/game/ui/OverheadUIManager.ts');
const { GravityHazard, GravityLifecycleState } = await import('../src/game/hazards/GravityHazard.ts');
const { CrisisManager } = await import('../src/game/crises/CrisisManager.ts');
const { OrbitalCrisis } = await import('../src/game/crises/OrbitalCrisis.ts');
const { SteamToyTitanBoss } = await import('../src/game/bosses/SteamToyTitanBoss.ts');
const { ObjectPool } = await import('../src/game/pooling/ObjectPool.ts');
const { PetDroneAlly, ShieldGuardAlly } = await import('../src/game/entities/AllyEntities.ts');
const { ALLY_ARCHETYPES } = await import('../src/game/entities/types.ts');
const {
  renderMeteorStreak,
  renderSuperNovaWave,
  renderScorchDecal,
  renderChronoStasisVFX,
  createAegisDomeVisual,
} = await import('../src/game/ultimate_skills.ts');
const {
  MultiTouchPointerTracker,
  createDefaultMobileInputState,
  resolveJoystickVector,
} = await import('../src/game/input_state.ts');
const { simulateBombKickSlide } = await import('../src/game/gameplay_mechanics.ts');
const GameSceneMod = await import('../src/game/GameScene.ts');
const GameScene = GameSceneMod.default || GameSceneMod.GameScene;
const { TILE_SIZE, BASE_PLAYER_SPEED } = GameSceneMod;

/* ==============================================================================
 * TIER 1: 15TH RELIC & 11TH SYNERGY CATALOG VALIDATION
 * ============================================================================== */

test('Tier 1.1: ABYSSAL_MAELSTROM_PEARL exists in RelicId and RELIC_CATALOG with 500ms ICD', () => {
  assert.equal(RelicId.ABYSSAL_MAELSTROM_PEARL, 'abyssal_maelstrom_pearl');
  const def = RELIC_CATALOG[RelicId.ABYSSAL_MAELSTROM_PEARL];
  assert.ok(def, 'ABYSSAL_MAELSTROM_PEARL must exist in RELIC_CATALOG');
  assert.equal(def.id, RelicId.ABYSSAL_MAELSTROM_PEARL);
  assert.equal(def.name, 'Abyssal Maelstrom Pearl');
  assert.equal(def.rarity, 'epic');
  assert.equal(def.internalCooldownMs, 500);
  assert.equal(def.icon, '🌊🐚');
  assert.ok(def.description.length > 0);
  assert.ok(def.mechanics.includes('undertow maelstrom'));
  assert.deepEqual(def.synergyPartners, [RelicId.CORROSIVE_MIASMIC_FLASK]);
  assert.equal(def.synergyName, 'Hadal Brine Maelstrom');
});

test('Tier 1.2: Reciprocal partnership between ABYSSAL_MAELSTROM_PEARL and CORROSIVE_MIASMIC_FLASK preserves Bio-Electric Neuro-Overload', () => {
  const pearl = RELIC_CATALOG[RelicId.ABYSSAL_MAELSTROM_PEARL];
  const flask = RELIC_CATALOG[RelicId.CORROSIVE_MIASMIC_FLASK];

  assert.ok(pearl.synergyPartners.includes(RelicId.CORROSIVE_MIASMIC_FLASK));
  assert.ok(flask.synergyPartners.includes(RelicId.ABYSSAL_MAELSTROM_PEARL));
  assert.ok(flask.synergyPartners.includes(RelicId.TESLA_OVERCHARGE_COIL));
  assert.equal(flask.synergyName, 'Bio-Electric Neuro-Overload');

  const hadal = SYNERGY_DEFINITIONS.find((s) => s.name === 'Hadal Brine Maelstrom');
  assert.ok(hadal, 'Hadal Brine Maelstrom must exist in SYNERGY_DEFINITIONS');
  assert.equal(hadal.icon, '🌊☣️');
  assert.ok(
    (hadal.relicA === RelicId.ABYSSAL_MAELSTROM_PEARL && hadal.relicB === RelicId.CORROSIVE_MIASMIC_FLASK) ||
      (hadal.relicA === RelicId.CORROSIVE_MIASMIC_FLASK && hadal.relicB === RelicId.ABYSSAL_MAELSTROM_PEARL)
  );
});

/* ==============================================================================
 * TIER 2: EXHAUSTIVE 105 PAIRWISE SYNERGY MATRIX (C(15, 2) = 105)
 * ============================================================================== */

test('Tier 2.1: All 105 pairwise relic combinations are symmetric and discover all 11 synergies', () => {
  const allRelics = Object.keys(RELIC_CATALOG);
  assert.equal(allRelics.length, 15);
  assert.equal(SYNERGY_DEFINITIONS.length, 11);

  let pairs = 0;
  let activePairs = 0;
  const names = new Set();

  for (let i = 0; i < allRelics.length; i++) {
    for (let j = i + 1; j < allRelics.length; j++) {
      pairs++;
      const a = allRelics[i];
      const b = allRelics[j];
      const rmAB = new RelicManager([a, b], 2);
      const rmBA = new RelicManager([b, a], 2);
      const synAB = rmAB.getActiveSynergies();
      const synBA = rmBA.getActiveSynergies();
      assert.equal(synAB.length, synBA.length);
      assert.equal(rmAB.hasSynergy(a, b), rmBA.hasSynergy(b, a));
      if (synAB.length > 0) {
        activePairs++;
        for (const s of synAB) names.add(s.name);
      }
    }
  }

  assert.equal(pairs, 105);
  assert.equal(activePairs, 11);
  assert.equal(names.size, 11);
  assert.ok(names.has('Hadal Brine Maelstrom'));
});

/* ==============================================================================
 * TIER 3 & 4: STANDALONE & SYNERGY COMBAT MATH + NEAREST TARGET SELECTION
 * ============================================================================== */

test('Tier 3.1: Standalone ABYSSAL_MAELSTROM_PEARL selects up to 3 nearest enemies within 2.5 tiles', () => {
  const rm = new RelicManager([RelicId.ABYSSAL_MAELSTROM_PEARL], 1);
  assert.equal(rm.hasAnyDetonationEnemyRelic(), true);

  const enemies = [
    { id: 'far_out', r: 5, c: 8 }, // dist 3.0 > 2.5 (excluded)
    { id: 'mid_3', r: 7, c: 6 },   // dist sqrt(5) ~= 2.236
    { id: 'near_1', r: 5, c: 6 },  // dist 1.0
    { id: 'edge_4', r: 5, c: 7.5 }, // dist 2.5 (4th nearest, excluded by cap=3)
    { id: 'near_2', r: 6, c: 6 },  // dist sqrt(2) ~= 1.414
  ];

  const res = rm.onBombDetonationAbyssalPearl(5, 5, enemies, 1000);
  assert.deepEqual(res.pulledEnemyIds, ['near_1', 'near_2', 'mid_3']);
  assert.equal(res.damage, 55);
  assert.equal(res.slowRatio, 0.35);
  assert.equal(res.undertowDurationMs, 2000);
  assert.equal(res.pullSpeedPx, 120);
  assert.equal(res.stunDurationMs, 0);
  assert.equal(res.isHadalBrineMaelstrom, false);
});

test('Tier 4.1: Hadal Brine Maelstrom synergy expands to 3.5 tiles, 4 targets, 135 dmg, 55% slow, 180 pull, 1500ms stun', () => {
  const rm = new RelicManager(
    [RelicId.ABYSSAL_MAELSTROM_PEARL, RelicId.CORROSIVE_MIASMIC_FLASK],
    2
  );
  assert.equal(rm.hasSynergy(RelicId.ABYSSAL_MAELSTROM_PEARL, RelicId.CORROSIVE_MIASMIC_FLASK), true);

  const enemies = [
    { id: 'out_5', r: 5, c: 8.6 },  // dist 3.6 > 3.5 (excluded)
    { id: 'e_4', r: 5, c: 8.4 },    // dist 3.4
    { id: 'e_2', r: 6, c: 6 },      // dist 1.414
    { id: 'e_5', r: 8.5, c: 5 },    // dist 3.5 (5th, capped at 4)
    { id: 'e_1', r: 5, c: 5.5 },    // dist 0.5
    { id: 'e_3', r: 5, c: 7 },      // dist 2.0
  ];

  const res = rm.onBombDetonationAbyssalPearl(5, 5, enemies, 2000);
  assert.deepEqual(res.pulledEnemyIds, ['e_1', 'e_2', 'e_3', 'e_4']);
  assert.equal(res.damage, 135);
  assert.equal(res.slowRatio, 0.55);
  assert.equal(res.undertowDurationMs, 3000);
  assert.equal(res.pullSpeedPx, 180);
  assert.equal(res.stunDurationMs, 1500);
  assert.equal(res.isHadalBrineMaelstrom, true);
});

/* ==============================================================================
 * TIER 5: 500MS ICD, NEGATIVE NOWMS, & PRE-ICD MALFORMED INPUT GUARDS
 * ============================================================================== */

test('Tier 5.1: Invalid coordinates or empty/non-array enemy lists never consume 500ms ICD', () => {
  const rm = new RelicManager(
    [RelicId.ABYSSAL_MAELSTROM_PEARL, RelicId.TESLA_OVERCHARGE_COIL],
    2
  );
  const validEnemies = [{ id: 'target_a', r: 5, c: 6 }];

  // NaN bomb coords must NOT burn ICD
  assert.equal(rm.onBombDetonationAbyssalPearl(Number.NaN, 5, validEnemies, 1000).pulledEnemyIds.length, 0);
  assert.equal(rm.onBombDetonationTeslaCoil(Number.NaN, 5, validEnemies, 1000).shockedEnemyIds.length, 0);

  // Empty enemy list must NOT burn ICD
  assert.equal(rm.onBombDetonationAbyssalPearl(5, 5, [], 1000).pulledEnemyIds.length, 0);

  // Negative timestamp must NOT burn ICD or overwrite lastProcTimes
  assert.equal(rm.onBombDetonationAbyssalPearl(5, 5, validEnemies, -250).pulledEnemyIds.length, 0);

  // Immediate valid call at t=1000ms MUST still proc cleanly!
  const validProc = rm.onBombDetonationAbyssalPearl(5, 5, validEnemies, 1000);
  assert.deepEqual(validProc.pulledEnemyIds, ['target_a']);

  // Second call within 500ms (t=1400ms) is blocked by ICD
  assert.equal(rm.onBombDetonationAbyssalPearl(5, 5, validEnemies, 1400).pulledEnemyIds.length, 0);

  // Negative call at t=-100ms does NOT reset last=1000, so t=1300ms is still blocked
  assert.equal(rm.onBombDetonationAbyssalPearl(5, 5, validEnemies, -100).pulledEnemyIds.length, 0);
  assert.equal(rm.onBombDetonationAbyssalPearl(5, 5, validEnemies, 1300).pulledEnemyIds.length, 0);

  // At t=1500ms (delta === 500ms), ICD unlocks
  assert.equal(rm.onBombDetonationAbyssalPearl(5, 5, validEnemies, 1500).pulledEnemyIds.length, 1);
});

/* ==============================================================================
 * TIER 6: GAMESCENE LIVE 2-SLOT PERK SYNC & EXPLODEBOMB HADAL BRINE INTEGRATION
 * ============================================================================== */

test('Tier 6.1: GameScene syncs 2-slot perk bonus to RelicManager and executes Hadal Brine Maelstrom on explodeBomb', () => {
  const scene = new GameScene();
  scene.init();
  scene.relicManager = new RelicManager(1);
  scene.map = Array.from({ length: 13 }, () => Array(15).fill(0));
  scene.time = {
    now: 5000,
    delayedCall: () => ({ paused: false, remove: () => {} }),
    removeEvent: () => {},
  };
  scene.cameras = { main: { flash: () => {}, setScroll: () => {}, setRotation: () => {} } };
  scene.tweens = { add: () => ({}), killTweensOf: () => {} };
  scene.game = { events: { emit: () => {}, on: () => {}, off: () => {} } };

  // Upgrade relic_resonance perk to level 2 -> maxRelicSlots becomes 2!
  scene.onPerksUpdated({ relic_resonance: 2 });
  assert.equal(scene.relicManager.getMaxSlots(), 2, 'onPerksUpdated must sync maxRelicSlots=2 to RelicManager');

  scene.onRelicsUpdated({
    equipped: [RelicId.ABYSSAL_MAELSTROM_PEARL, RelicId.CORROSIVE_MIASMIC_FLASK],
    maxSlots: 2,
  });
  assert.equal(scene.relicManager.getEquippedRelics().length, 2);
  assert.equal(
    scene.relicManager.hasSynergy(RelicId.ABYSSAL_MAELSTROM_PEARL, RelicId.CORROSIVE_MIASMIC_FLASK),
    true
  );

  let tookDamage = 0;
  let velocityVx = 0;
  let velocityVy = 0;
  let appliedSlow = 1;
  let appliedStun = 0;

  const mockEnemy = {
    entityId: 'ent_brine_target',
    active: true,
    isDead: false,
    x: 6 * TILE_SIZE + TILE_SIZE / 2,
    y: 5 * TILE_SIZE + TILE_SIZE / 2,
    takeDamage(dmg) {
      tookDamage += dmg;
    },
    setVelocity(vx, vy) {
      velocityVx = vx;
      velocityVy = vy;
    },
    applySpeedMultiplier(mult) {
      appliedSlow = mult;
    },
    applyStun(ms) {
      appliedStun = Math.max(appliedStun, ms);
    },
  };

  scene.enemies = { getChildren: () => [mockEnemy] };
  scene.allies = { getChildren: () => [] };
  scene.neutrals = { getChildren: () => [] };
  scene.items = { getChildren: () => [] };
  scene.blocks = { getChildren: () => [] };
  scene.explosions = { getChildren: () => [], create: () => null };

  const bombData = new Map([
    ['id', 'bomb_brine_test'],
    ['owner', 'player'],
    ['power', 2],
    ['type', 'REGULAR'],
  ]);
  const mockBomb = {
    active: true,
    x: 5 * TILE_SIZE + TILE_SIZE / 2,
    y: 5 * TILE_SIZE + TILE_SIZE / 2,
    getData: (k) => bombData.get(k),
    setData: (k, v) => bombData.set(k, v),
    setActive(v) {
      this.active = v;
      return this;
    },
    setVisible() {
      return this;
    },
    disableBody() {
      this.active = false;
    },
  };
  scene.bombs = { getChildren: () => [mockBomb] };
  scene.activeBombs = 1;

  const scoreBefore = scene.score;
  scene.explodeBomb(mockBomb, 5, 5);

  // Both Corrosive Miasmic Flask (standalone 45 dmg) and Hadal Brine Maelstrom (135 dmg) proc cleanly!
  assert.equal(tookDamage, 45 + 135);
  assert.ok(velocityVx < -150, 'Enemy at col=6 must be pulled left toward bomb center at col=5');
  assert.equal(Math.abs(velocityVy) < 1e-6, true);
  assert.ok(Math.abs(appliedSlow - 0.45) < 1e-6, 'Hadal Brine applies 55% slow (0.45 speed multiplier)');
  assert.equal(appliedStun, 1500, 'Hadal Brine applies 1500ms neuro-brine stun');
  assert.ok(scene.score >= scoreBefore + 350);
  assert.equal(scene.activeBombs, 0);
});

/* ==============================================================================
 * TIER 7: OVERHEADUI INACTIVE DESTROY POOL RECLAMATION & STAGGER FIX
 * ============================================================================== */

test('Tier 7.1: OverheadUI.destroy releases hpGraphics even after setActive(false) and OverheadUIManager staggers symmetrically', () => {
  let releasedCount = 0;
  let nameTagDestroyed = false;
  let indicatorDestroyed = false;

  const mockGraphics = {
    active: true,
    clear() { return this; },
    setDepth() { return this; },
    setVisible() { return this; },
    setActive(v) { this.active = v; return this; },
    destroy() {},
  };

  const mockScene = {
    graphicsPool: {
      acquire: () => mockGraphics,
      release: () => { releasedCount++; },
    },
    add: {
      graphics: () => mockGraphics,
      text: () => ({
        active: true,
        setOrigin() { return this; },
        setDepth() { return this; },
        setVisible() { return this; },
        setActive(v) { this.active = v; return this; },
        setPosition() { return this; },
        setText() { return this; },
        setColor() { return this; },
        destroy() {
          if (!nameTagDestroyed) nameTagDestroyed = true;
          else indicatorDestroyed = true;
        },
      }),
    },
  };

  const ui = new OverheadUI(mockScene, 'Slime', 'enemy', 100);
  mockGraphics.setActive(false); // Previously caused destroy() to skip graphicsPool.release when hpGraphics.active === false!
  ui.destroy();

  assert.equal(releasedCount, 1, 'hpGraphics must be returned to graphicsPool even when inactive');
  assert.equal(nameTagDestroyed, true);
  assert.equal(indicatorDestroyed, true);

  // Verify symmetric vertical stagger when entity i sits slightly below entity j
  const mgr = new OverheadUIManager(true);
  const uiA = new OverheadUI(null, 'Alpha', 'enemy', 100);
  const uiB = new OverheadUI(null, 'Bravo', 'enemy', 100);
  const entA = { x: 200, y: 205, active: true, isDead: false, overheadUI: uiA };
  const entB = { x: 200, y: 200, active: true, isDead: false, overheadUI: uiB };
  mgr.update([entA, entB], { x: 400, y: 400 }, 16, true);
  assert.equal(uiA.customOffsetY, 46, 'Lower entity i must stagger downward (+46)');
  assert.equal(uiB.customOffsetY, -14, 'Upper entity j must stagger upward (-14)');
});

/* ==============================================================================
 * TIER 8: CROSS-HAZARD MASTERY SPEED BURST NON-COMPOUNDING
 * ============================================================================== */

test('Tier 8.1: Cycling multiple hazard mastery speed bursts never compounds playerSpeed permanently', () => {
  const scene = new GameScene();
  scene.init();
  scene.playerSpeed = BASE_PLAYER_SPEED; // 150
  const pendingCallbacks = [];
  scene.time = {
    now: 1000,
    delayedCall: (_ms, cb) => {
      const ev = { cb, removed: false, remove() { this.removed = true; } };
      pendingCallbacks.push(ev);
      return ev;
    },
  };

  // Trigger 4 distinct hazard speed bursts simultaneously (+25% each on base 150 -> +37.5 each, NOT exponential 150 * 1.25^4!)
  scene.applyMasterySpeedBurst('FROST_GLIDE', (s) => Math.round(s * 1.25), 1500);
  scene.applyMasterySpeedBurst('SOLAR_RADIANCE', (s) => Math.round(s * 1.25), 1500);
  scene.applyMasterySpeedBurst('NEBULA_GLIDE', (s) => Math.round(s * 1.25), 1500);
  scene.applyMasterySpeedBurst('ABYSSAL_GLIDE', (s) => Math.round(s * 1.25), 1500);

  // Expire all 4 timers
  for (const ev of pendingCallbacks) {
    if (!ev.removed) ev.cb();
  }

  assert.equal(scene.playerSpeed, BASE_PLAYER_SPEED, 'Player speed must return cleanly to BASE_PLAYER_SPEED with zero ratchet');
});

/* ==============================================================================
 * TIER 9 & 10: GRAVITY FUSION INACTIVE BOMB GUARD & CRISIS ONE-SHOT FAILURE
 * ============================================================================== */

test('Tier 9.1: GravityHazard.evaluateBombFusion ignores inactive pooled bombs and reads getData', () => {
  const gh = new GravityHazard();
  gh.init(6, 7);
  gh.state = GravityLifecycleState.SINGULARITY_PULL;

  const cx = gh.getCenterWorldX();
  const cy = gh.getCenterWorldY();

  const inactivePooledBombs = [
    { active: false, x: cx, y: cy, getData: (k) => (k === 'id' ? 'dead_1' : 3) },
    { active: false, x: cx + 4, y: cy, getData: (k) => (k === 'id' ? 'dead_2' : 4) },
  ];
  const noTrigger = gh.evaluateBombFusion(inactivePooledBombs, 1000);
  assert.equal(noTrigger.triggered, false, 'Inactive pooled bombs must never trigger Cosmic Fusion');

  const activeBombs = [
    { active: true, x: cx, y: cy, getData: (k) => (k === 'id' ? 'live_1' : k === 'power' ? 4 : undefined) },
    { active: true, x: cx + 6, y: cy, getData: (k) => (k === 'id' ? 'live_2' : k === 'power' ? 5 : undefined) },
  ];
  const triggered = gh.evaluateBombFusion(activeBombs, 1000);
  assert.equal(triggered.triggered, true);
  assert.ok(triggered.effectivePower > 5, 'Must read power from Phaser getData fallback');
});

test('Tier 10.1: CrisisManager emits crisis-failed only once and OrbitalCrisis handles 0ms stageDuration without NaN', () => {
  const cm = new CrisisManager();
  let failedEvents = 0;
  cm.setEventEmitter({
    events: {
      emit: (ev) => {
        if (ev === 'crisis-failed') failedEvents++;
      },
    },
  });

  // Force an active crisis whose stage transitions to FAILED
  cm.triggerCrisis(CrisisType.SOLAR_FLARES);
  const active = cm.getActiveCrisis();
  active.setStage(CrisisStage.FAILED);

  cm.update(16, { r: 1, c: 1, x: 60, y: 60 });
  cm.update(16, { r: 1, c: 1, x: 60, y: 60 });
  cm.update(16, { r: 1, c: 1, x: 60, y: 60 });

  assert.equal(failedEvents, 1, 'crisis-failed must only emit once per failed crisis');

  const orbital = new OrbitalCrisis();
  orbital.init();
  orbital.stage = CrisisStage.CLIMAX;
  orbital.stageDurationMs = 0;
  orbital.stageElapsedMs = 0;
  orbital.update(16, { r: 1, c: 1, x: 60, y: 60 });
  assert.equal(Number.isFinite(orbital.getMacrocannonCharge()), true);
});

/* ==============================================================================
 * TIER 11: TITAN SHOCKWAVE POOL, WATCHDOG KEYBOARD SAFETY, & FUZZ GUARDS
 * ============================================================================== */

test('Tier 11.1: SteamToyTitanBoss releases shockwaves on stun/defeat & input/kick fuzz guards hold', () => {
  const titan = new SteamToyTitanBoss(300, 260);
  titan.activateMalletShockwave();
  assert.ok(titan.getActiveShockwaves().length > 0);
  titan.applyStun(2.0);
  assert.equal(titan.getActiveShockwaves().length, 0, 'Applying stun must release active shockwaves');

  // Desktop keyboard state must NOT be wiped by 1s pointer watchdog when activePointers is empty
  const tracker = new MultiTouchPointerTracker();
  const input = createDefaultMobileInputState();
  input.right = true;
  const recovered = tracker.recoverDroppedPointers(input, 5000);
  assert.equal(recovered, 0);
  assert.equal(input.right, true, 'Watchdog must not wipe keyboard directional flags when 0 pointers dropped');

  // Small deadzone (0.0005) at exact (0, 0) must stay neutral
  const idleVec = resolveJoystickVector(0, 0, 0.0005);
  assert.equal(idleVec.up || idleVec.down || idleVec.left || idleVec.right, false);

  // Float seed in generateWaveMutators and NaN/Infinity in simulateBombKickSlide must never throw or hang
  const muts = ScalingEngine.generateWaveMutators(5, 3.75);
  assert.ok(Array.isArray(muts));
  const map = Array.from({ length: 13 }, () => Array(15).fill(0));
  const slideRes = simulateBombKickSlide(map, Number.NaN, 3, 1, 0, [], Number.POSITIVE_INFINITY);
  assert.equal(Number.isFinite(slideRes.rebounds), true);
});

/* ==============================================================================
 * TIER 12: 10,000-FRAME ZERO-GC SOAK TEST
 * ============================================================================== */

test('Tier 12.1: 10,000-frame Hadal Brine Maelstrom soak maintains identical scratch reference & Zero-GC budget', () => {
  const rm = new RelicManager(
    [RelicId.ABYSSAL_MAELSTROM_PEARL, RelicId.CORROSIVE_MIASMIC_FLASK],
    2
  );
  const enemies = [
    { id: 'soak_1', r: 5, c: 6 },
    { id: 'soak_2', r: 6, c: 6 },
    { id: 'soak_3', r: 7, c: 5 },
    { id: 'soak_4', r: 4, c: 4 },
    { id: 'soak_5', r: 8, c: 8 },
  ];

  const firstRef = rm.onBombDetonationAbyssalPearl(5, 5, enemies, 1000);
  const firstArrayRef = firstRef.pulledEnemyIds;

  if (global.gc) global.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  let simNow = 2000;

  for (let frame = 0; frame < 10000; frame++) {
    simNow += 16;
    const out = rm.onBombDetonationAbyssalPearl(5, 5, enemies, simNow);
    assert.equal(out, firstRef, 'Must reuse pre-allocated _scratchAbyssalPearl object');
    assert.equal(out.pulledEnemyIds, firstArrayRef, 'Must reuse pre-allocated pulledEnemyIds array');
  }

  if (global.gc) global.gc();
  const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024);
  assert.ok(heapDeltaMb < 4.5, `Expected < 4.5MB heap drift across 10k frames, got ${heapDeltaMb.toFixed(2)}MB`);
});

/* ==============================================================================
 * TIER 13: ZERO-GC OBJECT-POOLING RECLAMATION (ONCOMPLETE + ONSTOP / SHUTDOWN)
 * ============================================================================== */

test('Tier 13.1: PetDroneAlly bolt & ShieldGuardAlly taunt ring acquire/release circlePool on both onComplete and onStop', () => {
  const activeTweens = [];
  const createArc = () => ({
    active: false,
    visible: false,
    x: 0,
    y: 0,
    setActive(v) { this.active = v; return this; },
    setVisible(v) { this.visible = v; return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setRadius() { return this; },
    setFillStyle() { return this; },
    setStrokeStyle() { return this; },
    setAlpha() { return this; },
    setScale() { return this; },
    setDepth() { return this; },
  });

  const circlePool = new ObjectPool(createArc, (arc) => {
    arc.setActive(false).setVisible(false).setStrokeStyle(0, 0, 0);
  }, 4, 16);

  let rawAddCircleCount = 0;
  const pooledScene = {
    circlePool,
    add: { circle: () => { rawAddCircleCount++; return createArc(); } },
    tweens: {
      add(cfg) { activeTweens.push(cfg); return cfg; },
    },
  };

  const mockPlayer = { active: true, x: 200, y: 200 };
  const mockTargetEnemy = {
    active: true,
    isDead: false,
    x: 240,
    y: 200,
    isStunned: false,
    stunUntil: 0,
    overheadUI: { setIntent() {} },
  };

  const droneCtx = {
    isDead: false,
    active: true,
    x: 200,
    y: 200,
    shootTimer: 0,
    orbitAngle: 0,
    config: ALLY_ARCHETYPES.PET_DRONE,
    scene: pooledScene,
    overheadUI: { setIntent() {} },
    updateEntity() {},
    setVelocity() {},
  };

  const guardCtx = {
    isDead: false,
    active: true,
    x: 200,
    y: 200,
    tauntTimer: 0,
    config: ALLY_ARCHETYPES.SHIELD_GUARD,
    scene: pooledScene,
    overheadUI: { setIntent() {} },
    updateEntity() {},
    setVelocity() {},
  };

  // 1) Fire PetDrone bolt + ShieldGuard taunt ring and stop mid-flight (onStop)
  PetDroneAlly.prototype.updateAI.call(droneCtx, 16, 1000, mockPlayer, [], [mockTargetEnemy]);
  ShieldGuardAlly.prototype.updateAI.call(guardCtx, 16, 1000, mockPlayer, 'down', [mockTargetEnemy]);
  assert.equal(rawAddCircleCount, 0, 'Must never allocate transient scene.add.circle when circlePool exists');
  assert.equal(circlePool.activeCount, 2, 'Both bolt and taunt ring must be acquired from circlePool');

  for (const tw of activeTweens.splice(0)) {
    tw.onStop?.();
    tw.onComplete?.(); // Double-fire idempotency check
  }
  assert.equal(circlePool.activeCount, 0, 'Both pooled arcs must be released cleanly on onStop without double-release');

  // 2) Fire again and finish normally via onComplete
  droneCtx.shootTimer = 0;
  guardCtx.tauntTimer = 0;
  PetDroneAlly.prototype.updateAI.call(droneCtx, 16, 5000, mockPlayer, [], [mockTargetEnemy]);
  ShieldGuardAlly.prototype.updateAI.call(guardCtx, 16, 5000, mockPlayer, 'right', [mockTargetEnemy]);
  assert.equal(circlePool.activeCount, 2);
  for (const tw of activeTweens.splice(0)) {
    tw.onComplete?.();
  }
  assert.equal(circlePool.activeCount, 0, 'Both pooled arcs must be released cleanly on onComplete');
});

test('Tier 13.2: Ultimate VFX & GameScene.spawnPickupParticles reclaim circlePool/rectPool/graphicsPool on interruption', () => {
  const tweensQueue = [];
  const createArc = () => ({
    active: false,
    visible: false,
    x: 100,
    y: 100,
    setActive(v) { this.active = v; return this; },
    setVisible(v) { this.visible = v; return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setRadius() { return this; },
    setFillStyle() { return this; },
    setStrokeStyle() { return this; },
    setAlpha() { return this; },
    setScale() { return this; },
    setDepth() { return this; },
  });
  const createRect = () => ({
    active: false,
    visible: false,
    setActive(v) { this.active = v; return this; },
    setVisible(v) { this.visible = v; return this; },
    setPosition() { return this; },
    setSize() { return this; },
    setFillStyle() { return this; },
    setAlpha() { return this; },
    setDepth() { return this; },
  });
  const createGfx = () => ({
    active: false,
    visible: false,
    clear() { return this; },
    lineStyle() { return this; },
    fillStyle() { return this; },
    fillCircle() { return this; },
    strokeCircle() { return this; },
    strokeRect() { return this; },
    beginPath() { return this; },
    moveTo() { return this; },
    lineTo() { return this; },
    strokePath() { return this; },
    setActive(v) { this.active = v; return this; },
    setVisible(v) { this.visible = v; return this; },
    setAlpha() { return this; },
    setDepth() { return this; },
  });

  const circlePool = new ObjectPool(createArc, (a) => a.setActive(false), 8, 32);
  const rectPool = new ObjectPool(createRect, (r) => r.setActive(false), 2, 8);
  const graphicsPool = new ObjectPool(createGfx, (g) => g.setActive(false), 4, 16);

  const vfxScene = {
    circlePool,
    rectPool,
    graphicsPool,
    scale: { width: 600, height: 520 },
    add: {
      circle: createArc,
      rectangle: createRect,
      graphics: createGfx,
    },
    time: {
      delayedCall: () => ({ remove() {} }),
    },
    tweens: {
      add(cfg) { tweensQueue.push(cfg); return cfg; },
      addCounter(cfg) { tweensQueue.push(cfg); return cfg; },
    },
  };

  renderMeteorStreak(vfxScene, 300, 260);
  renderSuperNovaWave(vfxScene, 300, 260);
  renderScorchDecal(vfxScene, 300, 260);
  const stasis = renderChronoStasisVFX(vfxScene, 5000);
  const dome = createAegisDomeVisual(vfxScene, { x: 300, y: 260, active: true });
  GameScene.prototype.spawnPickupParticles.call(vfxScene, 180, 180, '#22d3ee');

  // Trigger a meteor update tick so trail embers also spawn from circlePool
  tweensQueue[0].onUpdate?.();

  assert.ok(circlePool.activeCount >= 8, 'Meteor + corona + sparks (+ optional ember) acquired from circlePool');
  assert.equal(rectPool.activeCount, 1, 'Chrono stasis overlay acquired from rectPool');
  assert.equal(graphicsPool.activeCount, 4, 'SuperNova + ScorchDecal + Chrono border + Aegis dome acquired from graphicsPool');

  // Simulate scene shutdown interrupting all tweens via onStop and destroying active handles
  while (tweensQueue.length > 0) {
    const tw = tweensQueue.pop();
    tw.onStop?.();
    tw.onComplete?.(); // Verify idempotency
  }
  stasis.destroy();
  stasis.destroy();
  dome.destroy();
  dome.destroy();

  assert.equal(circlePool.activeCount, 0, '0 leaked circlePool objects after interruption');
  assert.equal(rectPool.activeCount, 0, '0 leaked rectPool objects after interruption');
  assert.equal(graphicsPool.activeCount, 0, '0 leaked graphicsPool objects after interruption');
});
