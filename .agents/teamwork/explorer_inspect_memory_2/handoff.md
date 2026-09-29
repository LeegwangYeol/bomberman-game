# Memory & Performance Audit Report: Bomberman Total Inspection (총검사)

## 1. Observation

Direct code and test observations across the memory, pooling, and performance subsystems:

### A. Zero-GC Object Pooling (`src/game/pooling/ObjectPool.ts`)
1. **Contiguous Storage & Typed Index Buffers**:
   - `ObjectPool<T>` (`src/game/pooling/ObjectPool.ts:15-55`) allocates fixed contiguous arrays and typed index structures in the constructor:
     - `this.storage = new Array<T>(this.capacity)` (line 34)
     - `this.freeIndices = new Int32Array(this.capacity)` (line 35)
     - `this.activeIndices = new Int32Array(this.capacity)` (line 36)
     - `this.itemToActiveSlot = new Int32Array(this.capacity)` (line 37)
     - `this.activeFlags = new Uint8Array(this.capacity)` (line 38)
     - `this.itemToIndexMap = new Map<T, number>()` (line 39)
   - Capacity presets in `POOL_PRESETS` (`src/game/pooling/ObjectPool.ts:194-200`):
     - `BOMBS: 32`, `EXPLOSIONS: 128`, `PARTICLES: 256`, `ITEM_DROPS: 48`, `FLOATING_TEXT: 32`.
2. **Swap-and-Pop $O(1)$ Release**:
   - `release(item: T)` (`src/game/pooling/ObjectPool.ts:96-129`):
     - Reverse lookup: `const itemIndex = this.itemToIndexMap.get(item);` ($O(1)$)
     - Double-release guard: `if (this.activeFlags[itemIndex] === 0) return false;` (lines 102-104)
     - Dense active slot compaction:
       ```ts
       const slot = this.itemToActiveSlot[itemIndex];
       const lastSlot = --this._activeCount;
       if (slot !== lastSlot) {
         const swappedItemIndex = this.activeIndices[lastSlot];
         this.activeIndices[slot] = swappedItemIndex;
         this.itemToActiveSlot[swappedItemIndex] = slot;
       }
       this.activeIndices[lastSlot] = -1;
       this.itemToActiveSlot[itemIndex] = -1;
       this.freeIndices[this.freeHead++] = itemIndex;
       this.activeFlags[itemIndex] = 0;
       ```
   - Traversal: `forEachActive` (`src/game/pooling/ObjectPool.ts:135-141`) iterates contiguously from index `0` to `this._activeCount - 1` with 0 allocations.
3. **Usage in Boss Subsystem**:
   - `BossAttackManager.ts:19-115` instantiates four `ObjectPool` instances:
     - `projectilePool: ObjectPool<BossProjectile>` (capacity 64)
     - `shockwavePool: ObjectPool<BossShockwave>` (capacity 16)
     - `minionPool: ObjectPool<BossMinion>` (capacity 8)
     - `telegraphPool: ObjectPool<TelegraphTile>` (capacity 64)
4. **Phaser Live Scene Disconnect**:
   - In `src/game/GameScene.ts`, Bombs, Explosions, Items, and Floating Text do NOT use `ObjectPool<T>`:
     - `this.bombs = this.physics.add.group();` (`GameScene.ts:867`)
     - `const bomb = this.bombs.create(centerX, centerY, 'bomb')` (`GameScene.ts:2334, 2440, 2539`) and `bomb.destroy();` (`GameScene.ts:2636`).
     - `const exp = this.explosions.create(x, y, 'explosion')` (`GameScene.ts:2750`) and `exp.destroy();` (`GameScene.ts:2774`).
     - `const item = this.items.create(centerX, centerY, textureKey)` (`GameScene.ts:3459`) and `item.destroy();`.
     - `const floating = this.add.text(...)` (`GameScene.ts:3616`) and `floating.destroy()` on tween complete (`GameScene.ts:3633`).
     - `FloatingTextManager` (`GameScene.ts:323-358`): allocates a new `{ x, y, spawnTime: currentTime }` object literal on every single floating text spawn (`GameScene.ts:356`) and slices `this.activeTexts = this.activeTexts.slice(this.head)` (`GameScene.ts:339`).
5. **Soak Test Mock Discrepancy**:
   - In `tests/soak_10k_frames.test.mjs:29-73`, `ContiguousObjectPool` was re-implemented rather than importing and using `ObjectPool<T>`:
     - Line 51: `const idx = this.pool.indexOf(item);` performs an $O(N)$ linear search, whereas production `ObjectPool<T>` uses an $O(1)$ Map index lookup.

---

### B. Zero-GC Pathfinding Arrays (`src/game/pathfinding.ts`)
1. **Pre-allocated 1D Typed Arrays**:
   - `ZeroGCPathfinder` (`src/game/pathfinding.ts:282-351`) initializes:
     - `visited: Uint16Array` (195 cells)
     - `queue: Int16Array` (195 cells)
     - `parent: Int16Array` (195 cells)
     - `dist: Int16Array` (195 cells)
     - `tempPath: Int16Array` (195 cells)
     - `heap: Int16Array` (1024 cells)
     - `obstacleMask: Uint8Array` (195 cells)
     - `hazardMask: Uint8Array` (195 cells)
2. **Generational Marker & Rollover**:
   - Generational tracking (`src/game/pathfinding.ts:345-351`):
     ```ts
     private resetVisited(): void {
       this.generation++;
       if (this.generation >= 65530) {
         this.visited.fill(0);
         this.generation = 1;
       }
     }
     ```
   - Checks visited status via `if (visited[nIdx] === gen) continue;` (line 432), avoiding zeroing out memory on every search.
3. **FlatHazardMask Duck-Typing**:
   - `FlatHazardMask` (`src/game/pathfinding.ts:70-276`): Wraps a `Uint8Array(195)` with `has()`, `add()`, `delete()`, `clear()`, and iterator implementations, avoiding `new Set<string>()` allocations.
4. **Pathfinding Helper Allocation Hot-Paths**:
   - `getBlastTiles(center, power, map)` (`src/game/pathfinding.ts:879-908`):
     - Allocates `new Set<string>()` and string keys `${nr},${nc}` on every call.
   - `cloneBombTilesAsSet(bombTiles)` (`src/game/pathfinding.ts:1069-1092`):
     - Allocates `new Set<string>()` and string keys `${r},${c}`.
   - `getSafeBombEscapePath(...)` (`src/game/pathfinding.ts:1232-1281`):
     - Calls `getBlastTiles` repeatedly for each existing bomb (lines 1237, 1248, 1259).
     - Allocates `new Set<string>()` for `simulatedBombs` (line 1267).
     - Parses string keys with `parseInt(bStr.slice(...))` (lines 1245-1246).
     - Calls `findEscapePathBFS` (line 1281), which allocates `new Array(len)` and `{ r, c }` objects (`pathfinding.ts:939-944`).
   - `canSafelyPlaceBomb` (`src/game/pathfinding.ts:1287-1296`):
     - Calls `getSafeBombEscapePath` only to check `path !== null && path.length > 0`, immediately throwing away the allocated array and `{ r, c }` objects.
   - Live AI usage in `src/game/entities/EnemyEntities.ts`:
     - Line 220: `this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);`
     - Line 238: `const dangerTiles = getBlastTiles({ r: er, c: ec }, this.bombPower, map);`
     - Line 239: `const simulatedBombTiles = cloneBombTilesAsSet(bombTiles);`
     - Line 241: `const safeEscape = findEscapePathBFS({ r: er, c: ec }, dangerTiles, map, simulatedBombTiles, 8);`
     - Repeated identically on lines 282-284, 596-598, 643-645.

---

### C. Audio Voice Pooling & Web Audio Cleanup (`src/game/pooling/AudioVoicePool.ts` & `src/game/ultimate_skills.ts`)
1. **AudioVoicePool Lifecycle & Voice Stealing**:
   - `AudioVoicePool` (`src/game/pooling/AudioVoicePool.ts:169-292`):
     - Fixed pool of 16 `AudioVoice` instances.
     - Persistent nodes: each voice starts `this.osc.start()` once in quiescent state (`gain = 0`).
     - Voice stealing (`src/game/pooling/AudioVoicePool.ts:231-245`): When all 16 voices are busy, it selects the voice nearest completion (`minRemaining = endTime - now`), calls `stolenVoice.forceSilence(ctx)`, which executes a 3ms linear ramp to `0.0001` before reassigning (lines 135-142), preventing speaker pops/clicks.
     - Clean teardown (`src/game/pooling/AudioVoicePool.ts:275-291`): calls `disconnect()` on all voices, stopping oscillators (`this.osc.stop()`) and disconnecting `osc`, `filter`, `gain`, and `masterBus`.
     - Suspended context: checks `if (ctx.state === 'suspended') ctx.resume().catch(...)` in `init()` (line 198) and `acquireVoice()` (line 217).
2. **WebAudioSynth Transient Nodes**:
   - `WebAudioSynth` (`src/game/ultimate_skills.ts:360-646`):
     - Transient oscillator/gain creation per ultimate SFX.
     - Auto-disconnect: `wireAutoDisconnect` (`src/game/ultimate_skills.ts:372-380`) attaches `osc.onended` handler disconnecting `osc`, `filter`, and `gain`.
     - Timeout tracking: `this.timeouts = new Set()` tracks delayed booms; `destroy()` (`lines 630-640`) clears timeouts and closes `this.ctx`.
3. **Integration Gaps**:
   - `GameScene.ts` imports global `webAudioSynth` (`GameScene.ts:109`) and uses it for ultimate skills, but `GameScene.ts:shutdown()` (`GameScene.ts:651-677`) NEVER invokes `webAudioSynth.destroy()`.
   - `AudioVoicePool` is completely unused in `GameScene.ts` for standard gameplay sounds (bomb drops, footsteps, explosions).

---

### D. Scene Shutdown & Event Listener Cleanup (`src/game/GameScene.ts` & `BombermanGame.tsx`)
1. **GameScene Teardown**:
   - `GameScene.ts:651-677` (`shutdown()`):
     - Removes listeners: `mode-changed`, `perks-updated`, `relics-updated`, `resume-run-state`.
     - Resets boss encounter (`this.dismissBoss()`) and clears telegraphs (`this.telegraphEngine.reset()`).
     - Stops crisis mode (`this.stopCrisisMode()`).
     - Resets `floatingTextManager`.
     - Destroys particle emitters (`playerDropShadow`, `dustEmitter`, `bombSparkEmitter`, `blockDebrisEmitter`).
2. **React Component Teardown (`BombermanGame.tsx:494-512`)**:
   - Cleanly unbinds `resize`, `keydown`, `keyup`, `pagehide`, `beforeunload`.
   - Deregisters Phaser event listeners: `stats-update`, `boss-hud-update`, `situation-log-update`, `currency-reward`.
   - Invokes `phaserGameRef.current.destroy(true)` and `manager.destroy()` for NippleJS.
3. **Uncleaned Objects in GameScene**:
   - `this.situationLog` (`SituationLog`) and `this.bossHUD` (`BossHUD`) created in `create()` have no cleanup in `shutdown()`.
   - `webAudioSynth.destroy()` is not called.
   - Any active delayed calls or tweens attached to `this.time` are not purged on shutdown.
4. **Per-Frame Allocation Hot-Paths in `GameScene.ts:update`**:
   - Lines 1862-1875:
     ```ts
     const activeEntities: BaseEntity[] = [];
     const collectActive = (group?: Phaser.Physics.Arcade.Group) => { ... };
     ```
     Creates a new array and closure on every frame.
   - `OverheadUIManager.update` (`GameScene.ts:163, 223`):
     - `const active = entities.filter(...)` creates a new array every frame.
     - `const offsetsX = new Float32Array(active.length);` (allocated every frame)
     - `const offsetsY = new Float32Array(active.length);` (allocated every frame)
     - Total: ~240 short-lived object/typed array allocations per second in 60 FPS update loop.
   - `BaseCrisis.getActiveHazardTiles` (`src/game/crises/BaseCrisis.ts:317`):
     - `return this.activeHazardList.slice(0, this.activeHazardCount);` allocates a new array every frame when a crisis is active (`GameScene.ts:1965`).
   - Conveyor drift (`GameScene.ts:1679`):
     - `this.conveyors.find((c) => c.row === bRow && c.col === bCol)` allocates an arrow function closure for every active bomb every frame.

---

### E. 10,000-Frame Soak Test Execution Telemetry
Executed `node --expose-gc --experimental-strip-types --test tests/soak_10k_frames.test.mjs`:
- Warmup Duration: 2.51 ms (1,000 frames)
- Soak Execution Time: 7.39 ms (9,000 frames)
- Average Frame Step Time: 0.0008 ms (0.8 µs/frame, well under 0.5 ms limit)
- Baseline Heap Used: 8.593 MB
- Final Heap Used: 8.523 MB
- Net Heap Drift: **-0.0698 MB (-73,216 bytes)** (Budget: <= 0.25 MB) — **PASS**
- Metrics: 125 bombs placed, 124 detonations, 1656 particles, 1821 BFS queries. Peak active: 2/32 bombs, 5/128 explosions, 16/256 particles.
- 20k Extended Soak (`tests/soak_20k_extended.test.mjs`):
  - 20,000 frames net drift: **+0.0076 MB (+8,000 bytes)** — **PASS**
  - Production `ObjectPool<T>` 20,000 cycle drift: **0.0000 MB** — **PASS**
- Full test suite: **644/644 passed across 41 test files**. Lint clean (0 errors). Turbopack build exit code 0.

---

## 2. Logic Chain

1. **Premise 1**: The headless simulation core (`ZeroGCPathfinder`, `ObjectPool<T>`, `FlatHazardMask`, `CameraTraumaSimulator`) satisfies Zero-GC constraints when exercised directly via typed array buffers.
   - *Evidence*: `tests/soak_10k_frames.test.mjs` and `tests/soak_20k_extended.test.mjs` exhibit net heap drift of -0.0698 MB and +0.0076 MB under V8 explicit compaction, maintaining all capacity invariants across 20,000 continuous frames.
2. **Premise 2**: A divergence exists between the headless simulation architecture and the live Phaser rendering/gameplay layer in `GameScene.ts`.
   - *Evidence*: `GameScene.ts` creates and destroys Phaser physics sprites (`bombs.create()`, `bomb.destroy()`, `explosions.create()`, `exp.destroy()`, `items.create()`, `item.destroy()`) and text objects (`add.text()`, `floating.destroy()`) rather than acquiring/releasing them from `ObjectPool<T>`.
3. **Premise 3**: AI helper routines in `src/game/pathfinding.ts` inadvertently break Zero-GC guarantees by converting between typed arrays and heap-allocated objects/strings.
   - *Evidence*: `getBlastTiles` constructs a `new Set<string>()` and string coordinates; `getSafeBombEscapePath` clones bomb sets, parses strings, and returns `GridCoord[]` arrays containing `{ r, c }` object instances. These are called repeatedly during entity decision cycles in `EnemyEntities.ts`.
4. **Premise 4**: The 60 FPS update loop in `GameScene.ts` contains unnecessary per-frame heap allocations for UI decluttering and crisis rendering.
   - *Evidence*: `GameScene.ts:1862-1875` allocates `activeEntities = []` and a closure every frame. `OverheadUIManager.update` allocates `active.filter(...)` and two `Float32Array` buffers every frame. `BaseCrisis.getActiveHazardTiles` performs `activeHazardList.slice(0, count)` every frame.
5. **Premise 5**: Audio lifecycle and scene teardown are robust for component-level tests but have minor dangling singleton and manager references.
   - *Evidence*: `AudioVoicePool` and `WebAudioSynth` implement complete node disconnect and context suspension handling, but `webAudioSynth.destroy()` is omitted from `GameScene.ts:shutdown()`, and `AudioVoicePool` is not wired into the main scene for regular SFX.

---

## 3. Caveats

1. **Headless vs Browser Environment**: The soak test runs in Node.js with V8 garbage collection flags (`--expose-gc`), measuring pure simulation heap drift. It does not measure browser Canvas 2D or WebGL GPU buffer allocations managed by Phaser.
2. **Phaser Arcade Physics Constraints**: Replacing Phaser physics groups (`this.bombs = this.physics.add.group()`) with pure `ObjectPool<T>` requires pooling Phaser Sprite objects with `setActive(false).setVisible(false)` and `body.enable = false`, rather than calling `sprite.destroy()`. While feasible, care must be taken with physics body collision state.
3. **Performance Impact in Practice**: Because Node.js handles short-lived Young Generation objects via Scavenge GC with minimal latency on modern desktop CPUs, the per-frame allocations in `OverheadUIManager` and `getBlastTiles` do not cause noticeable drops on desktop, but will induce GC micro-stutters (frame drops below 60 FPS) on low-end mobile devices (iOS WebKit / Android Chrome).

---

## 4. Conclusion

- **Overall Grade**: **PASS (Grade A-) with 3 High-Impact Remediation Opportunities**.
- **Strengths**:
  - `ZeroGCPathfinder` is mathematically sound, achieving zero heap allocations via generational marker rollover (up to 65,530) and 1D typed arrays (`Uint16Array`, `Int16Array`, `Uint8Array`).
  - `ObjectPool<T>` implements true $O(1)$ swap-and-pop release, double-release guards, and dense active traversal.
  - `AudioVoicePool` provides click-free voice stealing (3ms linear fade) and clean teardown.
  - React HUD unmount and keyboard/resize event listeners are 100% cleanly unregistered.
  - 10k and 20k soak tests pass within the <= 0.25 MB heap drift budget.
- **Defects / Leak Hot-Paths Identified**:
  1. **Hot-Path Allocations in AI Helpers**: `getBlastTiles`, `cloneBombTilesAsSet`, `findPathBFS`, and `getSafeBombEscapePath` allocate `Set<string>`, template strings, and `GridCoord[]` arrays during live enemy AI ticks.
  2. **Per-Frame Allocations in 60 FPS Update Loop**:
     - `GameScene.ts:1862`: `activeEntities = []` and `collectActive` closure created every frame.
     - `OverheadUIManager.update`: `.filter()` and `new Float32Array` (x2) allocated every frame.
     - `BaseCrisis.getActiveHazardTiles`: `activeHazardList.slice(0, count)` allocated every frame.
     - `GameScene.ts:1679`: `this.conveyors.find` closure allocated per bomb per frame.
  3. **Live Scene Object Pooling Disconnect**: Bombs, explosions, items, and floating text in `GameScene.ts` use dynamic Phaser object creation/destruction instead of recycling pre-allocated instances from `ObjectPool<T>`.
  4. **Scene Teardown Completeness**: `webAudioSynth.destroy()` is not called in `GameScene.ts:shutdown()`.

---

## 5. Concrete Remediation Steps & Defensive Tests

### Remediation Plan

#### Step 1: Zero-GC Entity Pathfinding & Blast Helpers (`src/game/pathfinding.ts`)
- Replace `getBlastTiles` with a zero-allocation version that populates a caller-supplied `FlatHazardMask` or `Uint8Array`, leveraging `zeroGCPathfinder.computeBlast(...)`.
- Add an in-place coordinate buffer `canSafelyPlaceBombFast(startIdx: number, power: number, ...): boolean` that directly queries `findSafeTile` without allocating `GridCoord[]` or `Set<string>`.
- Convert `EnemyEntities.ts` AI routines to pass flat tile indices (`er * COLS + ec`) and reusable buffers.

#### Step 2: Eliminate Per-Frame Allocations in `GameScene.ts` & `OverheadUIManager`
- In `OverheadUIManager`: Pre-allocate `offsetsX = new Float32Array(MAX_ENTITIES)` and `offsetsY = new Float32Array(MAX_ENTITIES)` in the constructor; reuse them each frame instead of calling `new Float32Array(active.length)`.
- In `GameScene.ts:1862`: Make `activeEntities: BaseEntity[]` a persistent class member array and clear it via `this.activeEntities.length = 0` at the start of `update()`.
- In `BaseCrisis.ts:315`: Provide `forEachActiveHazard((h: HazardTile) => void): void` to iterate `this.activeHazardList` up to `this.activeHazardCount` without calling `.slice(0, count)`.
- In `GameScene.ts:1679`: Replace `this.conveyors.find(...)` with a 195-element lookup array `this.conveyorGrid: (ConveyorBelt | null)[]` for $O(1)$ zero-allocation lookups.

#### Step 3: Implement Phaser GameObject Pooling for Bombs and Floating Text
- Create an `ArcadeSpritePool` wrapping `ObjectPool<Phaser.Physics.Arcade.Sprite>`:
  - Pre-allocate 32 bomb sprites and 128 explosion sprites during `GameScene.ts:create()`.
  - On release, execute `sprite.setActive(false).setVisible(false); (sprite.body as Phaser.Physics.Arcade.Body).enable = false;`.
  - On acquire, execute `sprite.setActive(true).setVisible(true); (sprite.body as Phaser.Physics.Arcade.Body).enable = true; sprite.setPosition(x, y);`.
- In `FloatingTextManager`: Pre-allocate a fixed pool of 32 `{ x: number, y: number, spawnTime: number }` items and reuse array indices instead of `.push()` and `.slice()`.

#### Step 4: Scene Teardown Hardening
- In `GameScene.ts:shutdown()`:
  - Add `webAudioSynth.destroy();`
  - Add `this.bossHUD?.reset();`
  - Add `this.situationLog?.reset();`
  - Add `this.time.removeAllEvents();`

---

### Recommended Defensive Regression Tests

1. **`tests/unit/overhead_ui_zerogc.test.mjs`**:
   - Run 10,000 continuous updates of `OverheadUIManager.update` with 16 active entities in a simulated game loop.
   - Assert heap drift under `--expose-gc` is strictly `<= 0.05 MB`.
2. **`tests/unit/pathfinding_blast_zerogc.test.mjs`**:
   - Run 20,000 calls to `canSafelyPlaceBomb` and blast queries.
   - Assert 0 string allocations and 0 `Set<string>` instantiations during queries.
3. **`tests/unit/scene_lifecycle_leak.test.mjs`**:
   - Mount and unmount `GameScene` / `BombermanGame` 100 consecutive times in a headless test harness.
   - Verify that all Phaser game events, Web Audio contexts, and window resize/keyboard listeners are completely purged with 0 zombie retainers.

---

## 6. Verification Method

To independently verify all findings and execute the telemetry suites:

```bash
# 1. Execute the 10,000-frame soak test under explicit V8 garbage collection
node --expose-gc --experimental-strip-types --test tests/soak_10k_frames.test.mjs

# 2. Execute the 20,000-frame extended soak test and ObjectPool component test
node --expose-gc --experimental-strip-types --test tests/soak_20k_extended.test.mjs

# 3. Execute unit tests for ObjectPool and AudioVoicePool
node --experimental-strip-types --test tests/unit/object_pool.test.mjs tests/unit/audio_voice_pool.test.mjs

# 4. Execute the adversarial pathfinder and Zero-GC stress tests
node --experimental-strip-types --test tests/adversarial_suicide_zerogc.test.mjs tests/m1_challenger_pathfinder_pool_stress.test.mjs

# 5. Run full test suite across the entire project (644 tests)
npm test

# 6. Verify lint and build integrity
npm run lint
npm run build
```

Invalidation Conditions:
- If `tests/soak_10k_frames.test.mjs` yields `Net Heap Drift > 0.25 MB` under `--expose-gc`, the Zero-GC baseline is invalidated.
- If `npm test` fails or any of the 644 tests fail, regressions have been introduced.
