# Comprehensive Survey Report: Test Suites, Builds, and Resilience Infrastructure

**Author**: Survey Explorer 3  
**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_survey_3`  
**Date**: 2026-09-17  
**Scope**: Codebase `/Users/user/src/bomberman` — Test runner, State Management & Persistence, 10,000-Frame Zero-GC Soak Test Harness, Chaos Bots & Attack Vectors, Regression Strategies for Massive Expansion.

---

## Executive Summary

This investigation surveys the test runner, build pipeline, state persistence, memory characteristics, and resilience infrastructure of the Bomberman game project. Currently, the test suite executes **280 tests across 17 test suites in ~164ms** using Node.js's native test runner with `--experimental-strip-types`, and the Next.js Turbopack build succeeds with zero compile errors. 

However, critical architectural gaps exist in persistence and garbage collection:
1. **Zero Persistence**: Match state and player progression reside 100% in volatile memory (`src/components/BombermanGame.tsx` and `src/game/GameScene.ts`). Refreshing the browser or encountering network interruptions (such as API 429 quota exhaustion) results in total state loss.
2. **GC Churn in Hot Paths**: The 60 FPS update loop creates objects every frame (e.g., `CameraTraumaSimulator.getOffsets()` allocating `{ x, y, angle }` objects, `new Set<string>()` allocated for bomb hazard tiles 60 times/sec, and `Phaser.GameObjects` dynamically created and destroyed for debris, floating text, and explosions).
3. **Absence of 10,000-Frame Soak & Chaos Testing**: No automated harness exists to verify zero-GC stability over 10,000 frames or to stress-test adversarial multi-touch, rapid pause/unpause, and boundary-breaking glitches.

This report delivers concrete designs and architectural blueprints for:
- Optimized test runner and build pipeline
- Full dual-tier persistence and API 429 quota recovery
- 10,000-frame headless Zero-GC soak test harness with object pooling
- Relentless Chaos bot fuzzing suite
- Comprehensive regression test matrix for epic bosses, map crises, and infinite scaling

---

## 1. Test Runner & Build Setup Analysis

### 1.1 Current Configuration (`package.json`)
The test and build scripts in `/Users/user/src/bomberman/package.json` are:
```json
{
  "name": "tmp-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "node --experimental-strip-types --test tests/*.test.mjs"
  },
  "dependencies": {
    "lucide-react": "^1.45.0",
    "next": "16.3.5",
    "nipplejs": "^1.0.4",
    "phaser": "^4.2.1",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.3.5",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

### 1.2 Test Execution Metrics
- **Command**: `npm test` (`node --experimental-strip-types --test tests/*.test.mjs`)
- **Environment**: Node.js v25.8.1 (macOS darwin-arm64)
- **Results**: 280 tests passed, 0 failed, 0 skipped across 17 test suites in **164.38 ms**.
- **Architecture**: Tests are written in `.mjs` files under `/Users/user/src/bomberman/tests/`. They leverage Node's built-in `node:test` and `node:assert/strict`, importing `.ts` files directly via `--experimental-strip-types`.

### 1.3 Warnings & Observations
1. **Typeless Package Warning**:
   ```
   (node:34162) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/user/src/bomberman/src/game/gameplay_mechanics.ts is not specified and it doesn't parse as CommonJS.
   Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
   To eliminate this warning, add "type": "module" to /Users/user/src/bomberman/package.json.
   ```
   Node parses the imported `.ts` files as CommonJS by default, encounters ESM export statements, and reparses them as ESM.
2. **ESM Import Path Requirements**:
   In Node's native ESM resolution, extensionless imports (e.g. `import { FACTIONS } from './types'` inside `BaseEntity.ts`) throw `Cannot find module ...`. Turbopack resolves them during `npm run build`, but Node's native runner requires explicit `.ts` or `.js` extensions. Tests currently avoid this by importing decoupled leaf modules (`types.ts`, `OverheadUI.ts`, `gameplay_mechanics.ts`, `ultimate_skills.ts`, `pathfinding.ts`).

### 1.4 Test Runner Comparison: `node:test` vs `vitest` / `jest`
| Feature | `node:test` (Current) | Vitest | Jest |
|---|---|---|---|
| **Dependencies** | 0 external deps (built-in) | ~30+ packages | ~50+ packages |
| **Execution Time** | **~164 ms** (blazing fast) | ~1.5 - 2.5 s | ~3.0 - 5.0 s |
| **TypeScript Support** | Native via `--experimental-strip-types` | Native via esbuild/Vite | Requires `ts-jest` / Babel |
| **V8 Heap Inspection** | Full support (`--expose-gc`, `process.memoryUsage()`) | Supported | Supported |
| **Mocking** | `import { mock } from 'node:test'` | `vi.fn()`, `vi.mock()` | `jest.fn()`, `jest.mock()` |
| **DOM Environment** | Manual mock or lightweight DOM | `happy-dom` / `jsdom` | `jsdom` |

**Recommendation**: Retain `node:test` as the primary test runner. It provides sub-200ms execution feedback, requires zero extra dependencies, and natively supports the `--expose-gc` flag needed for the 10,000-frame soak test.

### 1.5 Lint and Build Status
- **`npm run lint`**: Exits with code 0 (26 warnings for unused variables in test stress files, 0 errors).
- **`npm run build`**: Next.js 16.3.5 Turbopack builds successfully in ~1.5 seconds, generating static prerendered routes for `/` and `/_not-found`.

---

## 2. Current State Management & Persistence

### 2.1 State Distribution Across Layers
The game state is split across two separate layers without a unified persistence coordinator:

1. **React UI Layer (`src/components/BombermanGame.tsx`)**:
   - `stats`: `PlayerStats` (speed, bombPower, maxBombs, score, lives, itemsCollected, inventory, activeBuffs, ultimateGauge, etc.)
   - UI State: `isInventoryOpen`, `selectedMobileItem`, `hoveredDesktopItem`, `isMobile`.
   - Global Input: `window.mobileInput` (`up`, `down`, `left`, `right`, `bomb`, `dash`, `ultimate`).
   - Communication: Subscribes to Phaser via `phaserGame.events.on('stats-update', handleStatsUpdate)` (lines 191-196).

2. **Phaser Game Engine Layer (`src/game/GameScene.ts`)**:
   - Map State: `this.map: number[][]` (15x15 tile grid).
   - Entity Groups: `this.bombs`, `this.explosions`, `this.blocks`, `this.items`, `this.enemies`, `this.neutrals`, `this.allies`.
   - Player State: `this.player` (x, y, facing, i-frames, shieldVisual, isDashing, etc.).
   - Skill & Economy: `this.ultimateGauge`, `this.ultimateLockoutRemaining`, `this.activeUltimate`.

### 2.2 Lack of Persistence & Invalidation Scenarios
Currently, there is **zero persistence**:
- `localStorage` grep in `src/`: 0 results.
- `sessionStorage` grep in `src/`: 0 results.
- Unmounting the component destroys the entire Phaser game (`phaserGameRef.current.destroy(true)` in `BombermanGame.tsx:206`).
- **Failure Modes**:
  1. **Page Reload (F5)**: All items, scores, active bombs, and stats reset to defaults.
  2. **Mobile Background Eviction**: When a mobile user switches tabs or answers a phone call, iOS/Android memory pressure tears down the WebGL context; returning restarts the game from scratch.
  3. **API 429 Quota Limits**: If external AI or network services throttle with HTTP 429 Too Many Requests, games without persistence freeze or drop unsaved match progress.

### 2.3 Proposed Persistence Architecture: Dual-Tier State Engine

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PERSISTENCE ARCHITECTURE DESIGN                      │
├────────────────────────────────┬───────────────────────────────────────┤
│ Tier 1: Active Match Snapshot  │ Key: 'bomberman_save_active'          │
│ (sessionStorage + debounce LS) │ - Exact 15x15 map tile state          │
│                                │ - Player position (x, y), HP, buffs   │
│                                │ - Active bombs (fuse, power, owner)   │
│                                │ - Active enemies (HP, AI state)       │
│                                │ - Dropped items & grace timers        │
├────────────────────────────────┼───────────────────────────────────────┤
│ Tier 2: Meta-Progression Store │ Key: 'bomberman_profile_v1'           │
│ (localStorage permanent)       │ - High score, total blocks cleared    │
│                                │ - Unlocked relics & permanent perks   │
│                                │ - Boss defeat badges & crisis trophies│
│                                │ - Run statistics                      │
└────────────────────────────────┴───────────────────────────────────────┘
```

#### Serialized Game State Contract:
```typescript
export interface SerializedGameState {
  version: number;
  timestamp: number;
  saveTrigger: 'auto' | 'pause' | 'stage_clear' | 'quota_429' | 'page_hide';
  meta: {
    runId: string;
    stageIndex: number;
    gameMode: 'classic' | 'boss_rush' | 'crisis_endless';
    score: number;
    elapsedTimeMs: number;
  };
  player: {
    x: number;
    y: number;
    facing: 'up' | 'down' | 'left' | 'right';
    stats: PlayerStats;
  };
  board: {
    rows: number;
    cols: number;
    map: number[][]; // 0=empty, 1=wall, 2=block, 3=chest
    conveyors: ConveyorConfig[];
    portals: { portalA: GridCoord; portalB: GridCoord };
  };
  activeBombs: Array<{
    x: number;
    y: number;
    row: number;
    col: number;
    fuseRemainingMs: number;
    power: number;
    owner: string;
    bombType: ItemType | 'REGULAR';
  }>;
  activeEntities: Array<{
    id: string;
    archetype: string;
    faction: 'enemy' | 'neutral' | 'ally';
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    aiState: string;
  }>;
  activeItems: Array<{
    row: number;
    col: number;
    itemType: ItemType;
    spawnTime: number;
  }>;
}
```

#### API 429 Quota Recovery & Circuit Breaker:
```typescript
export class APIQuotaCircuitBreaker {
  private isThrottled = false;
  private backoffMs = 1000;
  private maxBackoffMs = 32000;

  public handleQuotaError(saveFn: () => void): void {
    this.isThrottled = true;
    // 1. Immediately serialize game state with 'quota_429' reason
    saveFn();
    // 2. Switch game to offline graceful fallback (e.g. procedural AI dialog)
    // 3. Schedule exponential backoff with jitter
    const jitter = Math.random() * 400 - 200;
    const retryDelay = Math.min(this.maxBackoffMs, this.backoffMs * 2) + jitter;
    this.backoffMs = retryDelay;
    
    setTimeout(() => {
      this.isThrottled = false;
    }, retryDelay);
  }
}
```

---

## 3. 10,000-Frame Soak Test Harness & Zero-GC Design

### 3.1 Hot-Path Allocation Profiling in Current Codebase
At 60 FPS, 10,000 frames is **166.67 seconds**. In the current codebase, the following allocations occur directly inside the per-frame update loop:

1. **`CameraTraumaSimulator.getOffsets()` (`src/game/ultimate_skills.ts:190-197`)**:
   ```typescript
   // ALLOCATES NEW OBJECT EVERY FRAME (60 allocations/sec)
   const x = mag.offsetPx * (Math.sin(t * 1.37) * 0.65 + Math.cos(t * 2.11) * 0.35);
   const y = mag.offsetPx * (Math.cos(t * 1.73) * 0.65 + Math.sin(t * 2.89) * 0.35);
   const angle = mag.angleDeg * Math.sin(t * 1.93);
   return { x, y, angle }; // <-- 10,000 allocations in 10k frames
   ```
2. **Hazard Tile Grid in `update()` (`src/game/GameScene.ts:1745-1753`)**:
   ```typescript
   // ALLOCATES NEW SET AND STRING TEMPLATES EVERY FRAME
   const bombTiles = new Set<string>(); // <-- 10,000 Sets allocated
   this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
     bombTiles.add(`${row},${col}`);   // <-- 10,000s of string allocations
   });
   ```
3. **Array Filtering in Entity Loop (`src/game/GameScene.ts:1818-1821`)**:
   ```typescript
   // ALLOCATES 2 NEW ARRAYS EVERY FRAME
   const activeEnemies = this.enemies.getChildren().filter((c) => c.active && c instanceof BaseEntity) as BaseEntity[];
   const activeItems = this.items.getChildren().filter((c) => c.active);
   ```
4. **Transient Phaser GameObjects (`GameScene.ts:2240, 2272, 2340, 2399, 2926, 3107, 3132`)**:
   - Explosions, shockwave graphics, block debris, dash ghost trails, spark bursts, and floating combat text are created via `this.add...` and destroyed via `obj.destroy()`.
   - In 10,000 frames of combat, this creates over 5,000 short-lived Phaser game objects, causing severe V8 young-generation GC pauses.

### 3.2 Zero-GC Object Pooling Architecture

To guarantee zero allocations in steady-state gameplay:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ZERO-GC POOLING SYSTEM                          │
├───────────────────┬────────────────────────────────────────────────────┤
│ Pool<Bomb>        │ Pre-allocated 16 items. Active flag toggling.      │
│ Pool<Explosion>   │ Pre-allocated 64 items with multi-tint support.   │
│ Pool<Debris>      │ Pre-allocated 64 debris rectangles.                │
│ Pool<SparkVFX>    │ Pre-allocated 64 spark circles.                    │
│ Pool<FloatText>   │ Pre-allocated 16 text labels with alpha tween.     │
│ HazardGrid2D      │ 15x15 Uint8Array (225 bytes total, 0-allocation).  │
│ ScratchVector     │ Reusable mutable vector { x, y, angle }.           │
└───────────────────┴────────────────────────────────────────────────────┘
```

#### Generic Zero-GC Pool Implementation Pattern:
```typescript
export class ObjectPool<T> {
  private pool: T[];
  private activeCount: number = 0;
  private factory: () => T;
  private resetFn: (item: T) => void;

  constructor(initialCapacity: number, factory: () => T, resetFn: (item: T) => void) {
    this.pool = new Array(initialCapacity);
    this.factory = factory;
    this.resetFn = resetFn;
    for (let i = 0; i < initialCapacity; i++) {
      this.pool[i] = factory();
    }
  }

  public acquire(): T {
    if (this.activeCount < this.pool.length) {
      const item = this.pool[this.activeCount++];
      return item;
    }
    // Hard limit reached; reuse oldest active item (ring buffer eviction)
    const item = this.pool[0];
    this.resetFn(item);
    return item;
  }

  public release(item: T): void {
    const idx = this.pool.indexOf(item);
    if (idx !== -1 && idx < this.activeCount) {
      this.resetFn(item);
      this.activeCount--;
      // Swap with last active item
      const temp = this.pool[idx];
      this.pool[idx] = this.pool[this.activeCount];
      this.pool[this.activeCount] = temp;
    }
  }
}
```

### 3.3 10,000-Frame Soak Test Harness Design
The soak test harness must run headlessly in Node.js with `--expose-gc`:

```typescript
// tests/soak_10k_frames.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

test('10,000-Frame Zero-GC Soak Test Harness', async () => {
  if (typeof global.gc !== 'function') {
    console.warn('Note: Run with node --expose-gc to verify garbage collection invariants');
  }

  const sim = new HeadlessGameSimulation();
  sim.initializeMatch();

  // 1. Warm-up Phase (Frames 0 -> 1,000): JIT optimization and pool warming
  for (let frame = 0; frame < 1000; frame++) {
    sim.step(16.66);
  }

  if (global.gc) global.gc();
  const baselineHeap = process.memoryUsage().heapUsed;
  const memorySnapshots = [];

  // 2. Steady-State Soak Phase (Frames 1,000 -> 10,000)
  for (let frame = 1000; frame <= 10000; frame++) {
    sim.step(16.66);

    // Sample heap every 1,000 frames
    if (frame % 1000 === 0) {
      const currentHeap = process.memoryUsage().heapUsed;
      memorySnapshots.push({ frame, heapUsed: currentHeap, delta: currentHeap - baselineHeap });
    }
  }

  if (global.gc) global.gc();
  const finalHeap = process.memoryUsage().heapUsed;
  const netHeapGrowthKb = (finalHeap - baselineHeap) / 1024;

  // Zero-GC Assertion: Net heap growth over 9,000 steady frames must be < 250 KB
  assert.ok(
    netHeapGrowthKb < 250,
    `Memory leak detected! Net heap growth was ${netHeapGrowthKb.toFixed(2)} KB over 9,000 steady frames`
  );
});
```

---

## 4. Design Requirements for Chaos Bots

### 4.1 Attack Vector Matrix

| # | Attack Vector | Simulation Mechanism | Vulnerability / Glitch Targeted | Strict Invariant Guaranteed |
|---|---|---|---|---|
| **V1** | **Relentless Directional Input Spam** | Send 1,000 rapid directional switches per second (`up`, `down`, `left`, `right` alternating or simultaneous). | Corner-sliding physics oscillation, bounding box snagging, `NaN` velocity. | Coordinates remain strictly within valid map corridors ($x \in [16, 584]$, $y \in [16, 584]$); velocity magnitude $\le \text{MAX\_SPEED}$. |
| **V2** | **Multi-Touch & Virtual Joystick Spam** | Inject rapid multi-touch touchstart/touchend events with zero delay; extreme angles ($<0^\circ$, $>360^\circ$, `NaN`). | Virtual joystick sticky input, boolean conversion failures, button overlap locks. | All `window.mobileInput` keys strictly resolve to `boolean`; no input sticking after touch release. |
| **V3** | **Resource Gauge & Lockout Overflow** | Inject negative charges, `Infinity`, $10^9$ points; spam activation trigger 500 times during 6000ms lockout. | Double-firing ultimate skills, infinite ultimate cascade, gauge overflow. | Gauge clamped strictly to $[0.0, 100.0]$; charge addition during lockout strictly returns 0; zero duplicate casts. |
| **V4** | **Fast Pause / Unpause Oscillation** | Rapidly toggle pause state 100 times in 1,000ms across bomb detonation and dash frames. | Timer accumulation drift, tween desynchronization, phantom double-explosions. | Timers pause and resume deterministically; explosion count invariant equals bomb count. |
| **V5** | **Physical Boundary & Warp Exploits** | Player AFK on portal for 10,000 frames; kick sliding bombs directly into border walls and conveyor dead-ends. | Endless warp ping-pong, conveyor pushing entities out of grid, bomb clipping into unbreakable walls. | Portal enforces 600ms exit-clearance cooldown; bombs halt cleanly at obstacle boundaries; zero entity clipping. |

### 4.2 Chaos Bot Architecture & Defensive Assertions
The Chaos Bot runs autonomously as an adversarial fuzzing harness:

```typescript
export class BombermanChaosBot {
  private sim: HeadlessGameSimulation;
  private violations: string[] = [];

  constructor(sim: HeadlessGameSimulation) {
    this.sim = sim;
  }

  public attackInputSpam(iterations = 5000): void {
    const keys = ['up', 'down', 'left', 'right', 'bomb', 'dash', 'ultimate'];
    for (let i = 0; i < iterations; i++) {
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      this.sim.sendInput(randomKey, Math.random() > 0.5);
      this.sim.step(16.66);
      this.assertPhysicalInvariants();
    }
  }

  public attackGaugeOverflow(): void {
    const maliciousValues = [-9999, NaN, Infinity, -Infinity, 1e9, undefined, null, '100'];
    for (const val of maliciousValues) {
      this.sim.engine.addCharge(val as number);
      assert.ok(
        !isNaN(this.sim.engine.gauge) && this.sim.engine.gauge >= 0 && this.sim.engine.gauge <= 100,
        `Gauge corrupted by input: ${val}`
      );
    }
  }

  private assertPhysicalInvariants(): void {
    const p = this.sim.player;
    assert.ok(!isNaN(p.x) && !isNaN(p.y), `Player coordinates corrupted: (${p.x}, ${p.y})`);
    assert.ok(p.x >= 16 && p.x <= 584, `Player breached X boundary: ${p.x}`);
    assert.ok(p.y >= 16 && p.y <= 584, `Player breached Y boundary: ${p.y}`);
  }
}
```

---

## 5. Regression Test Strategies for Massive Content Expansion

### 5.1 Scope of Expansion Features
1. **Multi-Phase Epic Bosses**:
   - Boss Archetypes (e.g. Giga Mecha Bomber, Void Devourer).
   - Phase Transitions: Phase 1 (Patrol & Bomb Barrage) $\to$ Phase 2 (Enrage & Minion Spawns) $\to$ Phase 3 (Desperation AOE).
   - Telegraphing mechanics and invulnerability frames during phase morphing.
2. **Stellaris-Style Dynamic Map Crises**:
   - Orbital Ion Strike: Cross-map targeted death beams with 2.0s visual warning.
   - Nanite Swarm / Dimensional Rifts: Map corruption converting soft blocks into hazard spawners.
   - Lava / Void Surge: Edge-inward closing perimeter fire.
3. **Infinite Scaling & Game Modes**:
   - Endless Stage scaling ($HP_{scaled} = HP_{base} \times (1 + 0.25 \times \text{stage})$).
   - Elite enemy affixes (Shielded, Fast, Splitter, Volatile).
   - Game Modes: Classic, Boss Rush, Endless Crisis, Speedrun.
4. **Meta-Progression & Relics**:
   - Permanent unlockable relics (e.g., "Phoenix Feather" = 1 free revive; "Magnetic Core" = +50% magnet pull range).

### 5.2 5-Tier Regression Matrix

```
┌────────────────────────────────────────────────────────────────────────┐
│                   5-TIER EXPANSION REGRESSION MATRIX                   │
├────────┬───────────────────────────────────────────────────────────────┤
│ Tier 1 │ CONTRACT & SPECIFICATION VERIFICATION                         │
│        │ - Boss Phase FSM definitions, trigger thresholds, and HP pools│
│        │ - Crisis hazard shapes, warning timers, and damage rules      │
│        │ - Relic stat mutators, equip limits, and rarity tiers         │
├────────┼───────────────────────────────────────────────────────────────┤
│ Tier 2 │ BOUNDARY & SAFETY CLAMPING                                    │
│        │ - Boss i-frames during morph prevent 1-frame burst skips      │
│        │ - Crisis hazard raycasts respect unbreakable border walls     │
│        │ - Endless scaling multipliers clamped to prevent numeric NaNs │
├────────┼───────────────────────────────────────────────────────────────┤
│ Tier 3 │ PAIRWISE CROSS-MECHANIC SYNERGIES                             │
│        │ - Chrono Freeze ultimate freezing Boss attack timers          │
│        │ - Orbital Ion Laser incinerating items past 600ms grace window│
│        │ - Shield Guard ally dome absorbing Crisis death beam damage   │
│        │ - Mini-Bomber ally eliminating friendly-fire vs Boss minions  │
├────────┼───────────────────────────────────────────────────────────────┤
│ Tier 4 │ CHAOS BOT & CORNER CASE FUZZING                               │
│        │ - Rapid pause/resume during Boss phase transition animation   │
│        │ - Dashing through Crisis hazard at the exact millisecond of hit│
│        │ - 5,000 multi-touch inputs while Boss executes screen shake   │
├────────┼───────────────────────────────────────────────────────────────┤
│ Tier 5 │ PERSISTENCE & 10K-FRAME SOAK VALIDATION                       │
│        │ - Save during Boss Phase 2 -> reload -> verify phase & HP     │
│        │ - 10,000-frame soak test with active Boss and Crisis running  │
│        │ - Zero-GC pool stability under simultaneous Boss and minions  │
└────────┴───────────────────────────────────────────────────────────────┘
```

---

## 6. Actionable Implementation Roadmap for Evolution Workers

| Milestone | Component | Scope & Target Files | Verification Target |
|---|---|---|---|
| **W1** | **Zero-GC Object Pooling & 10k Soak** | Implement `ObjectPool<T>` for bombs, explosions, debris, particles, floating text in `src/game/pooling/`. Refactor `GameScene.ts` and `ultimate_skills.ts`. | `node --expose-gc --test tests/soak_10k_frames.test.mjs` passes with $<250\text{ KB}$ heap drift. |
| **W2** | **State Persistence & 429 Recovery** | Create `src/game/persistence/GameStatePersistence.ts` with `serializeGameState()` and `deserializeGameState()`. Wire to `BombermanGame.tsx` and `GameScene.ts`. | `tests/persistence_recovery.test.mjs` verifies round-trip save/load and 429 circuit breaker. |
| **W3** | **Multi-Phase Bosses & Map Crises** | Create `src/game/entities/BossEntities.ts` and `src/game/crises/MapCrisisEngine.ts`. Wire to `GameScene.ts`. | `tests/bosses_and_crises.test.mjs` verifies all phase transitions and hazard bounds. |
| **W4** | **Infinite Scaling & Game Modes** | Create `src/game/modes/GameModeManager.ts` with endless scaling formulas and relic perk tree. | `tests/infinite_scaling_modes.test.mjs` passes all tier 1-3 regression tests. |
| **W5** | **Chaos Bot Resilience & Hardening** | Deploy `BombermanChaosBot` in `tests/chaos_resilience.test.mjs` testing 50,000 adversarial input vectors. | Zero invariant failures across all physical boundaries, inputs, and gauges. |

---

## 7. Conclusion

The Bomberman codebase has a robust foundation with 280 passing tests, clean Next.js Turbopack builds, and well-structured pathfinding, mechanics, and ultimate skills engines. By executing the Zero-GC object pooling refactor, installing the dual-tier state persistence manager with 429 circuit breaker, and locking in the 10,000-frame soak and Chaos bot test suites, the platform will achieve enterprise-grade stability and prepare flawlessly for massive creative content expansion.
