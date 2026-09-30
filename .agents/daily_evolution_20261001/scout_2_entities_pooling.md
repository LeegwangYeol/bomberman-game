# Scout 2: Entities & Object Pooling Lifecycle Scout Report
**Cycle Date:** 2026-10-01  
**Scout:** Scout 2 (Entities & Object Pooling Lifecycle Scout)  
**Target Subsystems:**
- `src/game/entities/` (`BaseEntity.ts`, `AllyEntities.ts`, `EnemyEntities.ts`, `NeutralEntities.ts`, `OverheadUI.ts`, `index.ts`, `types.ts`)
- `src/game/pooling/` (`ObjectPool.ts`, `AudioVoicePool.ts`)
- `src/game/GameScene.ts` (Entity lifecycle, floating text manager, audio synth integration)
- `src/game/pathfinding.ts` (Entity AI pathfinding interaction)

---

## 1. Executive Summary

| Subsystem / Area | Zero-GC Compliance Status | Severity | Primary Finding |
|---|---|---|---|
| **Entity Spawning & Recycling** | ❌ **FAIL (0% Pooled)** | **CRITICAL** | All entities (`Chaser`, `Bomber`, `Tank`, `Ghost`, `Splitter`, `Merchant`, `Critter`, allies) are instantiated with `new` and completely destroyed with `destroy()` upon death. No object pooling exists for entities. |
| **Floating Text System** | ⚠️ **PARTIAL (Deceptive)** | **HIGH** | `FloatingTextManager` manages position offsets via typed arrays (`Float32Array`), but `GameScene.spawnFloatingText` allocates brand new `Phaser.GameObjects.Text` and tweens on every hit/pickup, destroying them on complete. |
| **Audio Voice Pooling** | ⚠️ **ISOLATED (Unwired)** | **HIGH** | `AudioVoicePool` is robustly implemented with pre-allocated native AudioNodes and voice stealing, but was completely unused by `GameScene` / `WebAudioSynth`, which still created ephemeral `OscillatorNode` / `GainNode` per sound. |
| **Entity Per-Frame Loops** | ❌ **FAIL (High Allocation Churn)** | **CRITICAL** | Per-frame update loops allocate transient vectors (`{ r, c }`, `{ x, y }`), direction arrays, `new Set()`, string keys, closures, and `.filter()` arrays every frame. |
| **ObjectPool Implementation** | ✅ **PASS (Infrastructure Ready)** | **LOW** | `ObjectPool.ts` has strict O(1) swap-and-pop, typed-array indices, and zero runtime allocations, but is underutilized (only used in `BossAttackManager.ts`). |

---

## 2. In-Depth Subsystem Audits

### 2.1 Entity Spawning, Recycling & Pooling
- **Files Audited:** `src/game/entities/BaseEntity.ts`, `src/game/entities/index.ts`, `src/game/entities/EnemyEntities.ts`, `src/game/entities/AllyEntities.ts`, `src/game/entities/NeutralEntities.ts`.
- **Findings:**
  1. **Direct Heap Instantiation:** Factory methods `createEnemy()`, `createNeutral()`, and `createAlly()` in `src/game/entities/index.ts` invoke `new [EntityClass](scene, x, y)` on demand.
  2. **Splitter Division:** When `SplitterEnemy` dies, `onDeath()` allocates candidate coordinate arrays and filters them via `candidates.filter()`, then allocates two `new MiniSplitterEnemy(...)` instances onto the heap.
  3. **Destructive Death Lifecycle:** `BaseEntity.die()` calls:
     - `this.dropShadow.destroy()`
     - `this.overheadUI.destroy()` (destroys Graphics object and 2 Text objects)
     - 6 particle circles (`this.scene.add.circle(...)`) + 6 tweens (`this.scene.tweens.add(...)`) with `onComplete: () => spark.destroy()`
     - `this.destroy()` on the Sprite itself.
  4. **No `IPoolable` Implementation:** Neither `BaseEntity` nor any derived entity implements `IPoolable` or exposes a clean `reset(x, y)` method to restore health, reset timers, clear tweens, and reactivate physics bodies without re-instantiation.

### 2.2 Floating Text & Visual FX Pooling
- **Files Audited:** `src/game/GameScene.ts` (lines 388–475, 4091–4136), `src/game/pooling/ObjectPool.ts`.
- **Findings:**
  1. **Deceptive Zero-GC Ring Buffer:** `FloatingTextManager` manages coordinates in typed arrays (`poolX: Float32Array`, `poolY: Float32Array`, `poolTime: Float64Array`) to compute spatial stagger offsets (`getCascadeOffset`). However, this is only a coordinate tracker, **not** an object pool!
  2. **Transient Text Allocation:** In `GameScene.spawnFloatingText`:
     ```ts
     const floating = this.add.text(x, startY, text, { ... });
     this.tweens.add({
       targets: floating,
       y: targetY,
       alpha: 0,
       duration: 650,
       ease: 'Quad.easeOut',
       onComplete: () => floating.destroy(),
     });
     ```
     Every single floating text pop creates a brand new `Phaser.GameObjects.Text` (texture backing, canvas allocation, font measurement), a tween object, and a closure, destroying it after 650ms.
  3. **Bypassed Presets:** `POOL_PRESETS.FLOATING_TEXT` (capacity 32) and `POOL_PRESETS.PARTICLES` (capacity 256) defined in `src/game/pooling/ObjectPool.ts` are completely unused.
  4. **Pickup & Death Spark Spawners:** `spawnPickupParticles()` creates 6 circle GameObjects and 6 tweens per item pickup; `BaseEntity.die()` creates 6 circles and 6 tweens per death.

### 2.3 Audio Voice Pooling
- **Files Audited:** `src/game/pooling/AudioVoicePool.ts`, `src/game/ultimate_skills.ts` (lines 358–647), `src/game/hazards/DynamicHazardAudio.ts`.
- **Findings:**
  1. **AudioVoicePool Quality:** `AudioVoicePool` in `src/game/pooling/AudioVoicePool.ts` is exceptionally well designed:
     - 16 pre-allocated `AudioVoice` slots with persistent running `OscillatorNode`, `BiquadFilterNode`, and `GainNode`.
     - 3ms anti-click quick ramp on voice stealing.
     - Resumption hooks for suspended AudioContext.
     - Complete `disconnect()` and `destroy()` lifecycle teardown.
  2. **Core Game Disconnect:** `WebAudioSynth` in `src/game/ultimate_skills.ts` was not using `AudioVoicePool` at all. Every skill audio trigger created ad-hoc nodes (`ctx.createOscillator()`, `ctx.createGain()`) and assigned `osc.onended = () => { ... }` event handlers, resulting in native Web Audio GC churn.
  3. **Hazards Integration:** `DynamicHazardAudio.ts` was recently structured to accept an `AudioVoicePool`, but is not yet wired to `GameScene.ts`.

### 2.4 Per-Frame Heap Allocation Audit in Update Loops
Exhaustive scan of `updateAI`, `updateEntity`, and `GameScene.update` revealed significant per-frame heap churn:

#### A. Transient Vector and Coordinate Objects
- **`TankEnemy.updateAI` (Lines 832–838):**
  ```ts
  const checkNeighbors = [
    { r: er, c: ec },
    { r: er - 1, c: ec },
    { r: er + 1, c: ec },
    { r: er, c: ec - 1 },
    { r: er, c: ec + 1 },
  ];
  ```
  **1 array and 5 object literals allocated EVERY FRAME (60 FPS = 360 allocs/sec per Tank)!**
- **`ShieldGuardAlly.updateAI` (Lines 400–414):**
  `let offsetDir = { x: 0, y: 1 };` allocated every frame, plus switch-case overwrites `{ x: 0, y: -1 }`.
- **`ChaserEnemy.updateAI` / `BomberEnemy.updateAI`:**
  - Fallback patrol arrays: `const patrolDirs = [ { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 } ];` (1 array + 4 objects) allocated when path is blocked.
  - `this.attackDir = { x: dirX, y: dirY }`, `this.dashTargetTile = { r: pr, c: pc }` allocated on windup.
- **`NeutralEntities.ts`:**
  - `MerchantNPC.updateAI` (Lines 159–165): `openDirs: Array<{ x: number; y: number }> = []` and `dirs = [ { x: 1, y: 0 }, ... ]` allocated every frame.
  - `CritterNPC.updateAI` (Lines 274–284): `dirs = [ ... ]` and `dirs.filter(...)` allocated on hop decisions.

#### B. Dynamic Sets, String Templates & Splits in AI Loops
- **`MerchantNPC.updateAI` (Lines 87–98):**
  ```ts
  const allBlastTiles = new Set<string>();
  const bombSet = cloneBombTilesAsSet(bombTiles);
  for (const bKey of bombSet) {
    const [br, bc] = bKey.split(',').map(Number);
    ...
  }
  ```
  Allocates a `new Set<string>()`, a cloned `bombSet`, string splits, number mappings, and string interpolations (`${mr},${mc}`, `${nr},${nc}`) **every single frame**!
- **`ChaserEnemy` & `BomberEnemy` AI:**
  - Calls `cloneBombTilesAsSet(bombTiles)` without passing an `outTarget`, returning a newly allocated `Set<string>`.
  - Calls `getBlastTiles({ r: er, c: ec }, power, map)` without `outMask`, allocating `{ r, c }` and a `new Set<string>()`.
  - String keys `` `${er},${ec}` `` allocated on hazard simulation.

#### C. Pathfinding Consumption Waste
- **`findPathBFS` in `pathfinding.ts` (Lines 957–961):**
  ```ts
  const path: GridCoord[] = new Array(len);
  for (let i = 0; i < len; i++) {
    const idx = outPathBuffer[i];
    path[i] = { r: (idx / COLS) | 0, c: idx % COLS };
  }
  return path;
  ```
  Even though `ZeroGCPathfinder` uses zero-allocation typed arrays internally, the wrapper `findPathBFS` allocates a `new Array(len)` and `len` number of `{ r, c }` objects for every call!
- Entity callers pass transient `{ r: er, c: ec }`, `{ r: pr, c: pc }` objects on every path recalc (every 180–350ms per entity).

#### D. Per-Frame Closures & Slicing in `GameScene.ts`
- **Lines 2072–2125 (`GameScene.update`):**
  - Inline closure for Chaser bomb placement: `(r, c, fuseMs) => this.placeEnemyBomb(...)` allocated per enemy per frame.
  - Inline closure for Bomber bomb placement: `(r, c, fuseMs) => this.placeEnemyBomb(...)` allocated per enemy per frame.
  - Inline closures for Tank block demolition and stomp: `(r, c) => this.destroyBlock(r, c)` and `(slowPct, durationMs) => this.applyStompSlow(...)` allocated per tank per frame.
  - Inline closure for MiniBomber: `(r, c, power) => this.placeAllyBomb(...)` allocated per ally per frame.
- **Lines 2142–2145:**
  - `activeEnemies = this.enemies.getChildren().filter((c) => c.active && c instanceof BaseEntity) as BaseEntity[];` allocates a new array every frame if allies are active.
  - `activeItems = this.items.getChildren().filter((c) => c.active);` allocates a new array every frame if allies are active.
- **Array Mutation (`.shift()`):**
  `this.escapePath.shift()` and `this.fleePath.shift()` mutate and re-index arrays rather than using an index pointer.

#### E. OverheadUI Redraws
- `OverheadUI.getRenderLayers()`: allocates 4 nested object literals on invocation.
- `OverheadUI.renderHpBar()`: checks dirty flags, but because `barX` and `barY` change whenever an entity moves, `hpGraphics.clear()` and redraw instructions execute every frame while moving.

---

## 3. Targeted Recommendations & Action Plan

### Remediation Priority Matrix

| Priority | Area | Action Required | Target Division / Owner |
|---|---|---|---|
| **P0** | **Per-Frame Vector Allocations** | Replace inline arrays/objects in `TankEnemy` (`checkNeighbors`), `ShieldGuardAlly` (`offsetDir`), `ChaserEnemy`/`BomberEnemy` (`patrolDirs`), `MerchantNPC` (`dirs`), and `CritterNPC` (`dirs`) with module-level constant arrays or scratch structs. | Architect & Zero-GC Division |
| **P0** | **Merchant & Enemy AI Set/String Churn** | Eliminate `new Set<string>()`, `bKey.split(',')`, and string template keys in `MerchantNPC`, `ChaserEnemy`, and `BomberEnemy`. Pass pre-allocated `FlatHazardMask` / `Uint8Array` to `getBlastTiles` and `cloneBombTilesAsSet`. | Architect & Zero-GC Division |
| **P0** | **GameScene Entity Update Closures & Filters** | Replace per-frame inline arrow callbacks in `GameScene.update` with pre-bound member methods. Replace `.filter()` calls for `activeEnemies` and `activeItems` with contiguous scratch array population. | Architect & Zero-GC Division |
| **P1** | **Floating Text Object Pooling** | Upgrade `FloatingTextManager` to manage an `ObjectPool<Phaser.GameObjects.Text>` (capacity 32) using `POOL_PRESETS.FLOATING_TEXT`. Reuse text objects with custom frame-based lerp instead of allocating `this.tweens.add(...)`. | Worker / Remediation Division |
| **P1** | **AudioVoicePool Integration** | Wire `AudioVoicePool` into `WebAudioSynth` in `src/game/ultimate_skills.ts` and `GameScene.ts`. Deprecate ad-hoc `createOscillator` calls in favor of persistent voice recycling. | Worker / Remediation Division |
| **P1** | **Entity Object Pooling (`IPoolable`)** | Implement `IPoolable` on `BaseEntity` (adding `reset(x, y, archetype)`). Create `ObjectPool<BaseEntity>` for enemy/ally/neutral archetypes, recycling Phaser GameObjects and OverheadUI instead of calling `destroy()`. | Architect & Zero-GC Division |
| **P2** | **Zero-GC Pathfinding Consumption** | Expose a 1D index or typed-buffer path query directly to entities (e.g. `findPathIndices(startIdx, targetIdx, outBuffer)`), eliminating `new Array(len)` and `{ r, c }` objects during path requests. | Architect & Zero-GC Division |

---

## 4. Verification Checkpoints for Subsequent Divisions

1. **10k / 20k Soak Test Verification:**
   - Execute `node --test tests/soak_10k_frames.test.mjs` and `tests/adversarial_suicide_zerogc.test.mjs`.
   - Verify heap drift remains `< 0.25 MB` across 10,000+ simulation frames.
2. **Chrome DevTools Memory Profile:**
   - Take heapsnapshots before and after 5 minutes of intensive multi-entity combat (all 5 enemy types + 3 allies + 2 neutrals).
   - Verify count of `Phaser.GameObjects.Text`, `Phaser.GameObjects.Graphics`, and `AudioNode` instances remains strictly constant without staircase growth.
3. **Regression Test Suite:**
   - Run `node --test tests/entities_expansion.test.mjs tests/entities_adversarial_stress.test.mjs` to ensure 100% pass rate on all 32 entity behavioral invariants.
