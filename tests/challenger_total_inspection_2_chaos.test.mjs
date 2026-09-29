/**
 * challenger_total_inspection_2_chaos.test.mjs — Adversarial Stress Test Suite for Milestone 17
 *
 * Scope Tested:
 * 1. AI Stun Immunity Stress Test: All 6 enemy variants (Chaser, Bomber, Tank, Ghost, Splitter, MiniSplitter)
 *    verified across 500 consecutive frame updates when isStunned = true. Zero movement, zero path advancement, zero bombs.
 * 2. Wave Mutator Combinatorial Exhaustion: 2,000 distinct pseudo-random seeds (including edge cases 80, 87, 94, 178, 185)
 *    tested on ScalingEngine.generateWaveMutators, asserting 0 duplicate mutators and 0 incompatible combinations.
 * 3. Crisis Resolution Rate Invariant: 300 simulated 60 FPS update frames with resolved crises across all 6 crisis types,
 *    asserting totalCrisesResolved increments exactly 1 time (never 300 times).
 * 4. Security Fuzzing & Checksum Integrity: sanitizeMetaProfile fuzzed with astronomical numbers, prototype pollution,
 *    unknown perks, invalid modes/relics, plus mathematical verification of 24-hex checksums under tampering.
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
    if (err.code === "ERR_MODULE_NOT_FOUND") {
      for (const ext of [".ts", ".js", "/index.ts"]) {
        try {
          return await nextResolve(specifier + ext, context);
        } catch {}
      }
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  return result;
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, pathToFileURL('./'));

// Minimal DOM & Canvas mocks for headless Phaser entity instantiation
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

// Dynamic import of entity classes that rely on extensionless imports
const {
  ChaserEnemy,
  BomberEnemy,
  TankEnemy,
  GhostEnemy,
  SplitterEnemy,
  MiniSplitterEnemy,
} = await import('../src/game/entities/EnemyEntities.ts');

// Project imports
import {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_WALL,
  TILE_BLOCK,
  TILE_EMPTY,
} from '../src/game/pathfinding.ts';

import {
  ScalingEngine,
  WAVE_MUTATOR_CATALOG,
} from '../src/game/progression/ScalingEngine.ts';

import {
  WaveMutatorId,
  GameModeType,
  RelicId,
} from '../src/game/progression/ProgressionTypes.ts';

import {
  CONFECTIONERY_PERKS,
} from '../src/game/progression/PerkTree.ts';

import {
  CrisisManager,
} from '../src/game/crises/CrisisManager.ts';

import {
  CrisisType,
  CrisisStage,
} from '../src/game/crises/CrisisTypes.ts';

import {
  GameStatePersistence,
  calculateChecksum,
  verifyChecksum,
  MemoryStorageAdapter,
} from '../src/game/persistence/GameStatePersistence.ts';

import {
  STORAGE_SCHEMA_VERSION,
  EXPORT_APP_IDENTIFIER,
} from '../src/game/persistence/PersistenceTypes.ts';

/* ==============================================================================
 * TEST HELPER: HEADLESS PHASER SCENE MOCK
 * ============================================================================== */

function createMockScene() {
  const createChainable = () => {
    const obj = {
      x: 0,
      y: 0,
      depth: 0,
      alpha: 1,
      visible: true,
      text: '',
      active: true,
      destroy: () => { obj.active = false; },
    };
    const methods = [
      'setOrigin', 'setPosition', 'setDepth', 'setAlpha', 'setVisible',
      'setText', 'setFontSize', 'setFontFamily', 'setFontStyle', 'setColor',
      'setStroke', 'setShadow', 'setWordWrapWidth', 'setScale', 'setAngle',
      'clear', 'fillStyle', 'fillRect', 'strokeRect', 'lineStyle', 'setScrollFactor',
      'lineBetween', 'beginPath', 'closePath', 'strokePath', 'fillPath',
    ];
    for (const m of methods) {
      obj[m] = () => obj;
    }
    return obj;
  };

  return {
    sys: {
      queueDepthSort: () => {},
      anims: { on: () => {}, off: () => {}, get: () => null, create: () => {} },
      textures: { get: () => ({ get: () => ({}) }) },
    },
    add: {
      existing: (obj) => obj,
      text: () => createChainable(),
      graphics: () => createChainable(),
      image: () => createChainable(),
      circle: () => createChainable(),
    },
    physics: {
      add: {
        existing: (obj) => {
          obj.body = {
            setSize: () => obj.body,
            setOffset: () => obj.body,
            setCollideWorldBounds: () => obj.body,
            setVelocity: (vx, vy) => {
              obj.body.velocity.x = vx;
              obj.body.velocity.y = vy;
              return obj.body;
            },
            velocity: { x: 0, y: 0 },
            x: obj.x,
            y: obj.y,
            width: 24,
            height: 24,
          };
          return obj;
        },
      },
    },
    tweens: {
      add: () => ({ stop: () => {} }),
    },
    time: { now: 1000 },
  };
}

function createArenaMap() {
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
 * SUITE 1: AI STUN IMMUNITY STRESS TEST (ALL 6 ENEMY VARIANTS, 500 FRAMES)
 * ============================================================================== */

test('Challenger 2.1 [AI Stun]: ChaserEnemy - 500 frames stunned guarantees 0 velocity, 0 movement, 0 bomb drops', () => {
  const scene = createMockScene();
  const map = createArenaMap();
  const startX = 1 * TILE_SIZE + 16;
  const startY = 1 * TILE_SIZE + 16;
  const chaser = new ChaserEnemy(scene, startX, startY);

  chaser.isStunned = true;
  chaser.stunUntil = Infinity;
  chaser.bombCooldownTimer = 0;

  const player = { x: 1 * TILE_SIZE + 16, y: 5 * TILE_SIZE + 16, active: true };
  const bombTiles = new Set();
  let bombsDropped = 0;
  const dropBombCallback = () => {
    bombsDropped++;
    return true;
  };

  let currentTime = 1000;
  for (let frame = 1; frame <= 500; frame++) {
    currentTime += 16.66;
    chaser.updateAI(16.66, currentTime, player, map, bombTiles, dropBombCallback);

    assert.equal(chaser.body.velocity.x, 0, `Frame ${frame}: vx must be 0`);
    assert.equal(chaser.body.velocity.y, 0, `Frame ${frame}: vy must be 0`);
    assert.equal(chaser.x, startX, `Frame ${frame}: x must not drift`);
    assert.equal(chaser.y, startY, `Frame ${frame}: y must not drift`);
    assert.equal(bombsDropped, 0, `Frame ${frame}: must never drop bombs`);
    assert.equal(chaser.isStunned, true, `Frame ${frame}: must remain stunned`);
    assert.equal(chaser.escapePath.length, 0, `Frame ${frame}: escapePath must remain empty`);
  }
});

test('Challenger 2.2 [AI Stun]: BomberEnemy - 500 frames stunned guarantees 0 velocity, 0 movement, 0 bomb drops', () => {
  const scene = createMockScene();
  const map = createArenaMap();
  const startX = 1 * TILE_SIZE + 16;
  const startY = 1 * TILE_SIZE + 16;
  const bomber = new BomberEnemy(scene, startX, startY);

  bomber.isStunned = true;
  bomber.stunUntil = Infinity;
  bomber.bombCooldownTimer = 0;

  const player = { x: 1 * TILE_SIZE + 16, y: 3 * TILE_SIZE + 16, active: true };
  const bombTiles = new Set();
  let bombsDropped = 0;
  const dropBombCallback = () => {
    bombsDropped++;
    return true;
  };

  let currentTime = 1000;
  for (let frame = 1; frame <= 500; frame++) {
    currentTime += 16.66;
    bomber.updateAI(16.66, currentTime, player, map, bombTiles, dropBombCallback);

    assert.equal(bomber.body.velocity.x, 0, `Frame ${frame}: Bomber vx must be 0`);
    assert.equal(bomber.body.velocity.y, 0, `Frame ${frame}: Bomber vy must be 0`);
    assert.equal(bomber.x, startX, `Frame ${frame}: Bomber x must not drift`);
    assert.equal(bomber.y, startY, `Frame ${frame}: Bomber y must not drift`);
    assert.equal(bomber.activeBombs, 0, `Frame ${frame}: Bomber activeBombs must be 0`);
    assert.equal(bombsDropped, 0, `Frame ${frame}: Bomber must never drop bombs while stunned`);
    assert.equal(bomber.isStunned, true, `Frame ${frame}: Bomber must remain stunned`);
  }
});

test('Challenger 2.3 [AI Stun]: TankEnemy - 500 frames stunned guarantees 0 velocity, 0 movement, 0 block destruction', () => {
  const scene = createMockScene();
  const map = createArenaMap();
  // Place soft block adjacent to tank
  map[1][2] = TILE_BLOCK;

  const startX = 1 * TILE_SIZE + 16;
  const startY = 1 * TILE_SIZE + 16;
  const tank = new TankEnemy(scene, startX, startY);

  tank.isStunned = true;
  tank.stunUntil = Infinity;

  const player = { x: 1 * TILE_SIZE + 16, y: 5 * TILE_SIZE + 16, active: true };
  const bombTiles = new Set();
  let destroyedBlocks = 0;
  const destroyBlockCallback = () => {
    destroyedBlocks++;
  };
  let slowApplied = 0;
  const applyStompSlowCallback = () => {
    slowApplied++;
  };

  let currentTime = 1000;
  for (let frame = 1; frame <= 500; frame++) {
    currentTime += 16.66;
    tank.updateAI(16.66, currentTime, player, map, bombTiles, destroyBlockCallback, applyStompSlowCallback);

    assert.equal(tank.body.velocity.x, 0, `Frame ${frame}: Tank vx must be 0`);
    assert.equal(tank.body.velocity.y, 0, `Frame ${frame}: Tank vy must be 0`);
    assert.equal(tank.x, startX, `Frame ${frame}: Tank x must not drift`);
    assert.equal(tank.y, startY, `Frame ${frame}: Tank y must not drift`);
    assert.equal(destroyedBlocks, 0, `Frame ${frame}: Tank must not bulldoze blocks while stunned`);
    assert.equal(slowApplied, 0, `Frame ${frame}: Tank must not stomp slow while stunned`);
    assert.equal(tank.isStunned, true, `Frame ${frame}: Tank must remain stunned`);
  }
});

test('Challenger 2.4 [AI Stun]: GhostEnemy - 500 frames stunned guarantees 0 velocity, 0 movement, 0 dash', () => {
  const scene = createMockScene();
  const map = createArenaMap();
  const startX = 1 * TILE_SIZE + 16;
  const startY = 1 * TILE_SIZE + 16;
  const ghost = new GhostEnemy(scene, startX, startY);

  ghost.isStunned = true;
  ghost.stunUntil = Infinity;
  ghost.dashCooldownTimer = 0;

  // Player in line of sight (corridor) to entice Ether Dash
  const player = { x: 5 * TILE_SIZE + 16, y: 1 * TILE_SIZE + 16, active: true };
  const bombTiles = new Set();

  let currentTime = 1000;
  for (let frame = 1; frame <= 500; frame++) {
    currentTime += 16.66;
    ghost.updateAI(16.66, currentTime, player, map, bombTiles);

    assert.equal(ghost.body.velocity.x, 0, `Frame ${frame}: Ghost vx must be 0`);
    assert.equal(ghost.body.velocity.y, 0, `Frame ${frame}: Ghost vy must be 0`);
    assert.equal(ghost.x, startX, `Frame ${frame}: Ghost x must not drift`);
    assert.equal(ghost.y, startY, `Frame ${frame}: Ghost y must not drift`);
    assert.equal(ghost.isMaterialized, false, `Frame ${frame}: Ghost must not materialize dash while stunned`);
    assert.equal(ghost.isStunned, true, `Frame ${frame}: Ghost must remain stunned`);
  }
});

test('Challenger 2.5 [AI Stun]: SplitterEnemy - 500 frames stunned guarantees 0 velocity, 0 movement, 0 path advancement', () => {
  const scene = createMockScene();
  const map = createArenaMap();
  const startX = 1 * TILE_SIZE + 16;
  const startY = 1 * TILE_SIZE + 16;
  const splitter = new SplitterEnemy(scene, startX, startY);

  splitter.isStunned = true;
  splitter.stunUntil = Infinity;

  const player = { x: 3 * TILE_SIZE + 16, y: 3 * TILE_SIZE + 16, active: true };
  const bombTiles = new Set();

  let currentTime = 1000;
  for (let frame = 1; frame <= 500; frame++) {
    currentTime += 16.66;
    splitter.updateAI(16.66, currentTime, player, map, bombTiles);

    assert.equal(splitter.body.velocity.x, 0, `Frame ${frame}: Splitter vx must be 0`);
    assert.equal(splitter.body.velocity.y, 0, `Frame ${frame}: Splitter vy must be 0`);
    assert.equal(splitter.x, startX, `Frame ${frame}: Splitter x must not drift`);
    assert.equal(splitter.y, startY, `Frame ${frame}: Splitter y must not drift`);
    assert.equal(splitter.isStunned, true, `Frame ${frame}: Splitter must remain stunned`);
  }
});

test('Challenger 2.6 [AI Stun]: MiniSplitterEnemy - 500 frames stunned guarantees 0 velocity, 0 movement, 0 path advancement', () => {
  const scene = createMockScene();
  const map = createArenaMap();
  const startX = 1 * TILE_SIZE + 16;
  const startY = 1 * TILE_SIZE + 16;
  const miniSplitter = new MiniSplitterEnemy(scene, startX, startY);

  miniSplitter.isStunned = true;
  miniSplitter.stunUntil = Infinity;

  const player = { x: 5 * TILE_SIZE + 16, y: 5 * TILE_SIZE + 16, active: true };
  const bombTiles = new Set();

  let currentTime = 1000;
  for (let frame = 1; frame <= 500; frame++) {
    currentTime += 16.66;
    miniSplitter.updateAI(16.66, currentTime, player, map, bombTiles);

    assert.equal(miniSplitter.body.velocity.x, 0, `Frame ${frame}: MiniSplitter vx must be 0`);
    assert.equal(miniSplitter.body.velocity.y, 0, `Frame ${frame}: MiniSplitter vy must be 0`);
    assert.equal(miniSplitter.x, startX, `Frame ${frame}: MiniSplitter x must not drift`);
    assert.equal(miniSplitter.y, startY, `Frame ${frame}: MiniSplitter y must not drift`);
    assert.equal(miniSplitter.isStunned, true, `Frame ${frame}: MiniSplitter must remain stunned`);
  }
});

test('Challenger 2.7 [AI Stun]: Dynamic Stun Induction mid-motion instantly freezes all 6 variants', () => {
  const scene = createMockScene();
  const map = createArenaMap();
  const player = { x: 5 * TILE_SIZE + 16, y: 1 * TILE_SIZE + 16, active: true };
  const bombTiles = new Set();

  const enemies = [
    new ChaserEnemy(scene, 1 * TILE_SIZE + 16, 1 * TILE_SIZE + 16),
    new BomberEnemy(scene, 1 * TILE_SIZE + 16, 1 * TILE_SIZE + 16),
    new TankEnemy(scene, 1 * TILE_SIZE + 16, 1 * TILE_SIZE + 16),
    new GhostEnemy(scene, 1 * TILE_SIZE + 16, 1 * TILE_SIZE + 16),
    new SplitterEnemy(scene, 1 * TILE_SIZE + 16, 1 * TILE_SIZE + 16),
    new MiniSplitterEnemy(scene, 1 * TILE_SIZE + 16, 1 * TILE_SIZE + 16),
  ];

  let currentTime = 1000;

  // Run 30 frames unstunned
  for (let f = 0; f < 30; f++) {
    currentTime += 16.66;
    for (const e of enemies) {
      e.updateAI(16.66, currentTime, player, map, bombTiles);
    }
  }

  // Induce stun across all 6
  for (const e of enemies) {
    e.isStunned = true;
    e.stunUntil = currentTime + 100000;
  }

  // Record frozen snapshot
  const snapshots = enemies.map((e) => ({ x: e.x, y: e.y }));

  // Run 500 frames stunned
  let droppedBombs = 0;
  const bombCb = () => { droppedBombs++; return true; };

  for (let f = 1; f <= 500; f++) {
    currentTime += 16.66;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      e.updateAI(16.66, currentTime, player, map, bombTiles, bombCb);
      assert.equal(e.body.velocity.x, 0, `Variant ${e.entityName} vx must be 0 at frame ${f}`);
      assert.equal(e.body.velocity.y, 0, `Variant ${e.entityName} vy must be 0 at frame ${f}`);
      assert.equal(e.x, snapshots[i].x, `Variant ${e.entityName} x must remain frozen at frame ${f}`);
      assert.equal(e.y, snapshots[i].y, `Variant ${e.entityName} y must remain frozen at frame ${f}`);
      assert.equal(e.isStunned, true, `Variant ${e.entityName} must remain stunned at frame ${f}`);
    }
    assert.equal(droppedBombs, 0, `Frame ${f}: zero bombs dropped during collective dynamic stun`);
  }
});

/* ==============================================================================
 * SUITE 2: WAVE MUTATOR COMBINATORIAL EXHAUSTION (2,000 SEEDS & EDGE CASES)
 * ============================================================================== */

test('Challenger 2.8 [Wave Mutators]: Exhaustive 2,000 distinct seeds yields 0 duplicate mutators', () => {
  const edgeCaseSeeds = [80, 87, 94, 178, 185];
  const testSeeds = new Set(edgeCaseSeeds);

  // Add boundary & edge case seeds
  testSeeds.add(0);
  testSeeds.add(1);
  testSeeds.add(-1);
  testSeeds.add(-80);
  testSeeds.add(-87);
  testSeeds.add(-94);
  testSeeds.add(-178);
  testSeeds.add(-185);
  testSeeds.add(2147483647);
  testSeeds.add(-2147483648);
  testSeeds.add(104729);

  // Fill up to 2,000 unique seeds with pseudo-random LCG values
  let lcgState = 123456789;
  while (testSeeds.size < 2000) {
    lcgState = (lcgState * 1664525 + 1013904223) | 0;
    testSeeds.add(lcgState);
  }

  let totalTested = 0;
  let collisionCount = 0;
  let incompatiblePairCount = 0;

  for (const seed of testSeeds) {
    totalTested++;
    const mutators = ScalingEngine.generateWaveMutators(6, seed);

    assert.equal(mutators.length, 2, `Wave 6 with seed ${seed} must generate exactly 2 mutators`);
    assert.ok(mutators[0] !== undefined, `Mutator 0 must be defined for seed ${seed}`);
    assert.ok(mutators[1] !== undefined, `Mutator 1 must be defined for seed ${seed}`);

    // Assert 0 duplicate mutators
    if (mutators[0].id === mutators[1].id) {
      collisionCount++;
    }
    assert.notEqual(
      mutators[0].id,
      mutators[1].id,
      `Duplicate mutator detected on seed ${seed}: ${mutators[0].id}`
    );

    // Assert incompatible pairs (Glass Cannon + Dense Fortification) never coexist
    const hasGlassCannon = mutators[0].id === WaveMutatorId.GLASS_CANNON || mutators[1].id === WaveMutatorId.GLASS_CANNON;
    const hasDenseFort = mutators[0].id === WaveMutatorId.DENSE_FORTIFICATION || mutators[1].id === WaveMutatorId.DENSE_FORTIFICATION;
    if (hasGlassCannon && hasDenseFort) {
      incompatiblePairCount++;
    }
    assert.ok(
      !(hasGlassCannon && hasDenseFort),
      `Incompatible pair (Glass Cannon + Dense Fortification) detected on seed ${seed}`
    );

    // Verify mutators exist in catalog
    assert.ok(WAVE_MUTATOR_CATALOG[mutators[0].id] !== undefined);
    assert.ok(WAVE_MUTATOR_CATALOG[mutators[1].id] !== undefined);
  }

  assert.equal(totalTested, 2000, 'Must have evaluated exactly 2,000 distinct seeds');
  assert.equal(collisionCount, 0, 'Must have exactly 0 duplicate mutators across 2,000 seeds');
  assert.equal(incompatiblePairCount, 0, 'Must have 0 incompatible pair conflicts');
});

test('Challenger 2.9 [Wave Mutators]: Specific edge case seeds (80, 87, 94, 178, 185) resolve collision correctly', () => {
  const edgeCases = [80, 87, 94, 178, 185];

  for (const seed of edgeCases) {
    const mutators = ScalingEngine.generateWaveMutators(6, seed);
    assert.equal(mutators.length, 2, `Edge case seed ${seed} must return 2 mutators`);
    assert.notEqual(mutators[0].id, mutators[1].id, `Edge case seed ${seed} must not have duplicate mutators`);

    const hasGlassCannon = mutators.some((m) => m.id === WaveMutatorId.GLASS_CANNON);
    const hasDenseFort = mutators.some((m) => m.id === WaveMutatorId.DENSE_FORTIFICATION);
    assert.ok(
      !(hasGlassCannon && hasDenseFort),
      `Edge case seed ${seed} must resolve incompatible pair without collision`
    );
  }
});

test('Challenger 2.10 [Wave Mutators]: Wave progression tier invariants (Waves 1-2 empty, Waves 3-5 single, Waves 6+ dual)', () => {
  // Waves 1 and 2: empty
  assert.deepEqual(ScalingEngine.generateWaveMutators(1, 100), []);
  assert.deepEqual(ScalingEngine.generateWaveMutators(2, 100), []);

  // Waves 3, 4, 5: exactly 1 mutator
  for (let w = 3; w <= 5; w++) {
    for (let s = 1; s <= 20; s++) {
      const m = ScalingEngine.generateWaveMutators(w, s);
      assert.equal(m.length, 1, `Wave ${w} seed ${s} must have exactly 1 mutator`);
      assert.ok(WAVE_MUTATOR_CATALOG[m[0].id] !== undefined);
    }
  }

  // Waves 6, 10, 25, 50, 100: exactly 2 distinct mutators
  for (const w of [6, 10, 25, 50, 100]) {
    for (let s = 1; s <= 50; s++) {
      const m = ScalingEngine.generateWaveMutators(w, s * 73);
      assert.equal(m.length, 2, `Wave ${w} must have 2 mutators`);
      assert.notEqual(m[0].id, m[1].id, `Wave ${w} must have 0 duplicate mutators`);
    }
  }
});

/* ==============================================================================
 * SUITE 3: CRISIS RESOLUTION RATE INVARIANT (300 FRAMES, EXACTLY 1 INCREMENT)
 * ============================================================================== */

test('Challenger 2.11 [Crisis Invariant]: 300 update frames with resolved crisis increments totalCrisesResolved exactly 1 time', () => {
  const crisisTypes = [
    CrisisType.PASTEL_VOID,
    CrisisType.CLOCKWORK_REBELLION,
    CrisisType.ORBITAL_BOMBARDMENT,
    CrisisType.SOLAR_FLARES,
    CrisisType.CREEPING_LAVA,
    CrisisType.DIMENSIONAL_RIFTS,
  ];

  for (const crisisType of crisisTypes) {
    const cm = new CrisisManager();
    assert.equal(cm.getTotalCrisesResolved(), 0, 'Initial resolved count must be 0');

    cm.triggerCrisis(crisisType);
    assert.equal(cm.getTotalCrisesResolved(), 0, 'Triggering crisis does not increment resolved count');

    // Resolve crisis
    cm.resolveCrisis(`Victory in ${crisisType}`);
    assert.equal(cm.getTotalCrisesResolved(), 1, `Immediate resolution must increment to 1 for ${crisisType}`);

    // Simulate 300 60 FPS update frames (5 seconds of live simulation)
    for (let frame = 1; frame <= 300; frame++) {
      const status = cm.update(16.666, { r: 5, c: 5, x: 160, y: 160 });
      assert.equal(status.stage, CrisisStage.RESOLVED, `Frame ${frame}: stage must be RESOLVED`);
      assert.equal(status.isVictorious, true, `Frame ${frame}: isVictorious must be true`);
      assert.equal(
        cm.getTotalCrisesResolved(),
        1,
        `Frame ${frame} of ${crisisType}: totalCrisesResolved must be strictly 1, never ${frame + 1}`
      );
    }
  }
});

test('Challenger 2.12 [Crisis Invariant]: Sequential crisis progression preserves monotonic single-increment invariant', () => {
  const cm = new CrisisManager();
  assert.equal(cm.getTotalCrisesResolved(), 0);

  const testSequence = [
    CrisisType.PASTEL_VOID,
    CrisisType.ORBITAL_BOMBARDMENT,
    CrisisType.CREEPING_LAVA,
  ];

  for (let i = 0; i < testSequence.length; i++) {
    const type = testSequence[i];
    cm.triggerCrisis(type);

    // 60 frames during active crisis
    for (let f = 0; f < 60; f++) {
      cm.update(16.666, { r: 1, c: 1 });
      assert.equal(cm.getTotalCrisesResolved(), i, `During active crisis ${i + 1}, resolved count must remain ${i}`);
    }

    // Resolve crisis
    cm.resolveCrisis(`Cleared ${type}`);
    const expectedCount = i + 1;
    assert.equal(cm.getTotalCrisesResolved(), expectedCount, `After resolve, count must be ${expectedCount}`);

    // 300 frames post-resolution soak
    for (let f = 1; f <= 300; f++) {
      cm.update(16.666, { r: 2, c: 2 });
      assert.equal(
        cm.getTotalCrisesResolved(),
        expectedCount,
        `Post-resolution frame ${f} must maintain count ${expectedCount}`
      );
    }
  }

  assert.equal(cm.getTotalCrisesResolved(), 3, 'Final resolved count must equal exactly 3');
});

test('Challenger 2.13 [Crisis Invariant]: stopCrisis(resolved) followed by 300 frames increments exactly 1 time', () => {
  const cm = new CrisisManager();
  cm.triggerCrisis(CrisisType.CLOCKWORK_REBELLION);

  cm.stopCrisis('resolved', 'Clockwork neutralized');
  assert.equal(cm.getTotalCrisesResolved(), 1);

  for (let f = 1; f <= 300; f++) {
    const status = cm.update(16.666);
    assert.equal(status.stage, CrisisStage.INACTIVE);
    assert.equal(cm.getTotalCrisesResolved(), 1, `Frame ${f}: totalCrisesResolved must remain 1`);
  }
});

/* ==============================================================================
 * SUITE 4: SECURITY FUZZING & CHECKSUM INTEGRITY
 * ============================================================================== */

test('Challenger 2.14 [Security Fuzzing]: Astronomical currency numbers strictly clamped to [0, 999,999,999]', () => {
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage, storage);

  // defaultProfile has cosmicEssence: 100, starCandies: 50
  const testCases = [
    { input: 1e20, expectedCosmic: 999999999, expectedStar: 999999999 },
    { input: Infinity, expectedCosmic: 100, expectedStar: 50 },
    { input: -Infinity, expectedCosmic: 100, expectedStar: 50 },
    { input: -100, expectedCosmic: 0, expectedStar: 0 },
    { input: NaN, expectedCosmic: 100, expectedStar: 50 },
    { input: 12345.678, expectedCosmic: 12345, expectedStar: 12345 },
    { input: '1000000000', expectedCosmic: 100, expectedStar: 50 },
    { input: {}, expectedCosmic: 100, expectedStar: 50 },
    { input: null, expectedCosmic: 100, expectedStar: 50 },
  ];

  for (const tc of testCases) {
    const raw = {
      cosmicEssence: tc.input,
      starCandies: tc.input,
      perks: {},
    };

    const sanitized = persistence.sanitizeMetaProfile(raw);
    assert.equal(
      sanitized.cosmicEssence,
      tc.expectedCosmic,
      `cosmicEssence for input ${tc.input} must be ${tc.expectedCosmic}`
    );
    assert.equal(
      sanitized.starCandies,
      tc.expectedStar,
      `starCandies for input ${tc.input} must be ${tc.expectedStar}`
    );
    assert.ok(sanitized.cosmicEssence <= 999999999, 'cosmicEssence must not exceed 999,999,999');
    assert.ok(sanitized.starCandies <= 999999999, 'starCandies must not exceed 999,999,999');
    assert.ok(sanitized.cosmicEssence >= 0, 'cosmicEssence must not be negative');
    assert.ok(sanitized.starCandies >= 0, 'starCandies must not be negative');
    assert.ok(Number.isInteger(sanitized.cosmicEssence), 'cosmicEssence must be an integer');
    assert.ok(Number.isInteger(sanitized.starCandies), 'starCandies must be an integer');
  }
});

test('Challenger 2.15 [Security Fuzzing]: Prototype pollution payloads strictly rejected and neutralized', () => {
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage, storage);

  const payload = {
    cosmicEssence: 50,
    starCandies: 50,
    __proto__: { pollutedGlobal: 'HACKED' },
    constructor: { prototype: { adminAccess: true } },
    prototype: { malicious: true },
    perks: {
      __proto__: { injectedPerk: 999 },
      constructor: 999,
      prototype: 999,
      toString: 999,
      valueOf: 999,
      hasOwnProperty: 999,
      isPrototypeOf: 999,
      propertyIsEnumerable: 999,
      quick_wick: 2,
    },
    unlockedModes: ['__proto__', 'constructor', 'prototype', GameModeType.BOSS_RUSH],
  };

  const sanitized = persistence.sanitizeMetaProfile(payload);

  // Prototype pollution assertions
  assert.equal(({}).pollutedGlobal, undefined, 'Object.prototype must not be polluted with pollutedGlobal');
  assert.equal(({}).adminAccess, undefined, 'Object.prototype must not be polluted with adminAccess');
  assert.equal(({}).malicious, undefined, 'Object.prototype must not be polluted with malicious');
  assert.equal(({}).injectedPerk, undefined, 'Object.prototype must not be polluted with injectedPerk');

  // Forbidden keys must be stripped from own properties of perks
  assert.equal(Object.hasOwn(sanitized.perks, '__proto__'), false);
  assert.equal(Object.keys(sanitized.perks).includes('__proto__'), false);
  assert.equal(Object.hasOwn(sanitized.perks, 'constructor'), false);
  assert.equal(Object.hasOwn(sanitized.perks, 'prototype'), false);
  assert.equal(Object.hasOwn(sanitized.perks, 'toString'), false);
  assert.equal(Object.hasOwn(sanitized.perks, 'valueOf'), false);
  assert.equal(Object.hasOwn(sanitized.perks, 'hasOwnProperty'), false);

  // Valid perk must be preserved
  assert.equal(sanitized.perks['quick_wick'], 2);
});

test('Challenger 2.16 [Security Fuzzing]: Unknown perk keys and out-of-range levels rejected and clamped', () => {
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage, storage);

  const rawPerks = {
    // Malicious unknown perk keys
    hacked_speed: 999,
    godmode: 1,
    infinite_blast: 100,
    noclip_pass: 50,
    exploit_teleport: 1,
    // Valid perks with out-of-bounds levels
    quick_wick: 9999, // maxLevel is 3
    sugar_spark: -10, // negative level
    second_wind: 10.85, // float level, maxLevel is 1
  };

  const sanitized = persistence.sanitizeMetaProfile({ perks: rawPerks });

  // Unknown perks must be stripped
  assert.equal(sanitized.perks['hacked_speed'], undefined);
  assert.equal(sanitized.perks['godmode'], undefined);
  assert.equal(sanitized.perks['infinite_blast'], undefined);
  assert.equal(sanitized.perks['noclip_pass'], undefined);
  assert.equal(sanitized.perks['exploit_teleport'], undefined);

  // Valid perk clamping
  const quickWickMax = CONFECTIONERY_PERKS['quick_wick']?.maxLevel ?? 3;
  assert.equal(sanitized.perks['quick_wick'], quickWickMax, `quick_wick must be clamped to maxLevel ${quickWickMax}`);
  assert.equal(sanitized.perks['sugar_spark'], 0, 'Negative perk levels must clamp to 0');
  assert.equal(sanitized.perks['second_wind'], 1, 'Float perk level must floor and clamp to maxLevel (1 for second_wind)');
});

test('Challenger 2.17 [Security Fuzzing]: Invalid game modes and relics strictly filtered and capped', () => {
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage, storage);

  const raw = {
    unlockedModes: [
      'cheat_mode',
      'GOD_MODE',
      GameModeType.STANDARD,
      GameModeType.ENDLESS_GAUNTLET,
      12345,
      null,
      {},
      ['nested'],
      'debug_teleport',
    ],
    equippedRelics: [
      'infinity_gauntlet',
      'hacked_relic',
      RelicId.GELATINOUS_CORE,
      RelicId.PYROCLASTIC_PRISM,
      RelicId.POCKET_CHRONOMETER, // 3rd valid relic, but max slots is 2!
      999,
      null,
    ],
    discoveredRelics: [
      RelicId.GELATINOUS_CORE,
      'unknown_relic_id',
      1234,
      false,
      null,
    ],
  };

  const sanitized = persistence.sanitizeMetaProfile(raw);

  // Game modes: only valid modes retained
  assert.ok(sanitized.unlockedModes.includes(GameModeType.STANDARD));
  assert.ok(sanitized.unlockedModes.includes(GameModeType.ENDLESS_GAUNTLET));
  assert.ok(!sanitized.unlockedModes.includes('cheat_mode'));
  assert.ok(!sanitized.unlockedModes.includes('GOD_MODE'));
  assert.ok(!sanitized.unlockedModes.includes('debug_teleport'));

  // Equipped relics: only valid relics retained, and strictly sliced to MAX_RELIC_SLOTS (2)
  assert.equal(sanitized.equippedRelics.length, 2, 'Equipped relics must be capped at 2 slots');
  assert.equal(sanitized.equippedRelics[0], RelicId.GELATINOUS_CORE);
  assert.equal(sanitized.equippedRelics[1], RelicId.PYROCLASTIC_PRISM);
  assert.ok(!sanitized.equippedRelics.includes('infinity_gauntlet'));
  assert.ok(!sanitized.equippedRelics.includes('hacked_relic'));

  // Discovered relics: only strings retained
  for (const r of sanitized.discoveredRelics) {
    assert.equal(typeof r, 'string', 'All discovered relics must be strings');
  }
});

test('Challenger 2.18 [Checksum Integrity]: Deterministic 24-hex checksum, tamper rejection & collision resistance', () => {
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage, storage);

  const defaultProfile = persistence.createDefaultMetaProfile();
  defaultProfile.starCandies = 500;
  defaultProfile.cosmicEssence = 25;
  defaultProfile.perks = { BAKING_1: 2 };

  const pkg = {
    version: STORAGE_SCHEMA_VERSION,
    exportTimestamp: 1726000000000,
    exportApp: EXPORT_APP_IDENTIFIER,
    runState: null,
    metaProfile: defaultProfile,
    checksum: '',
  };

  // 1. Checksum format: exactly 24 hexadecimal characters
  const checksum = calculateChecksum(pkg);
  assert.equal(checksum.length, 24, 'Checksum must be exactly 24 characters');
  assert.match(checksum, /^[0-9a-f]{24}$/, 'Checksum must be valid 24-character hexadecimal');

  // 2. Determinism: identical input yields identical checksum
  const checksum2 = calculateChecksum(pkg);
  assert.equal(checksum, checksum2, 'Checksum calculation must be strictly deterministic');

  // 3. Verification succeeds on untampered data
  assert.ok(verifyChecksum(pkg, checksum), 'Verification must succeed for untampered package');

  // 4. Tamper tests: Single-bit mutations must fail verification
  const tampered1 = JSON.parse(JSON.stringify(pkg));
  tampered1.metaProfile.starCandies = 501; // +1 candy
  assert.equal(verifyChecksum(tampered1, checksum), false, 'Tampered starCandies must fail verification');

  const tampered2 = JSON.parse(JSON.stringify(pkg));
  tampered2.metaProfile.cosmicEssence = 26; // +1 essence
  assert.equal(verifyChecksum(tampered2, checksum), false, 'Tampered cosmicEssence must fail verification');

  const tampered3 = JSON.parse(JSON.stringify(pkg));
  tampered3.metaProfile.perks.BAKING_1 = 3; // +1 perk level
  assert.equal(verifyChecksum(tampered3, checksum), false, 'Tampered perk level must fail verification');

  const tampered4 = JSON.parse(JSON.stringify(pkg));
  tampered4.exportApp = 'hacked_app_id';
  assert.equal(verifyChecksum(tampered4, checksum), false, 'Tampered exportApp must fail verification');

  // 5. Collision resistance: 500 randomized valid save packages generate 500 distinct checksums
  const generatedChecksums = new Set();
  for (let i = 0; i < 500; i++) {
    const testPkg = {
      version: STORAGE_SCHEMA_VERSION,
      exportTimestamp: 1726000000000 + i * 1000,
      exportApp: EXPORT_APP_IDENTIFIER,
      runState: null,
      metaProfile: {
        ...defaultProfile,
        starCandies: i * 17,
        cosmicEssence: i * 3,
      },
      checksum: '',
    };
    const c = calculateChecksum(testPkg);
    assert.equal(generatedChecksums.has(c), false, `Collision detected at iteration ${i}: ${c}`);
    generatedChecksums.add(c);
  }
  assert.equal(generatedChecksums.size, 500, '500 distinct payloads must yield 500 distinct 24-hex checksums');
});
