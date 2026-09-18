# Completion Handoff Report — Memory Leaks & Performance Inspection

**Inspector**: `explorer_inspect_memory`  
**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_inspect_memory/`  
**Date**: 2026-09-18  
**Handoff Type**: Hard (Task Complete)

---

## 1. Observation

1. **`GameScene.ts` Global Event Listener Leak (Line 1547)**:
   ```ts
   // src/game/GameScene.ts:1546-1553
   // Wire Game Mode Changes for Boss Encounters
   this.game.events.on('mode-changed', (mode: string) => {
     if (mode === 'boss_rush' || mode === 'BOSS_RUSH') {
       this.startBossEncounter('king_gummy_bear');
     } else if (this.activeBoss) {
       this.dismissBoss();
     }
   });
   ```
   `this.game.events` is the global `Phaser.Game` event emitter. `GameScene` has no `shutdown()` or `destroy()` method. When `this.scene.restart()` is called (e.g. at line 2643 after player death), `create()` executes again and registers an additional closure on `this.game.events` without removing the prior listener.

2. **Unpooled Entity Allocation in `GameScene.ts` vs `POOL_PRESETS`**:
   - `src/game/pooling/ObjectPool.ts` lines 174–180 defines:
     ```ts
     export const POOL_PRESETS = {
       BOMBS: 32,
       EXPLOSIONS: 128,
       PARTICLES: 256,
       ITEM_DROPS: 48,
       FLOATING_TEXT: 32,
     } as const;
     ```
   - In `src/game/GameScene.ts`:
     - Bombs: `this.bombs.create(...)` (lines 2182, 2270, 2341) and `bomb.destroy()` (line 2373).
     - Explosions: `this.explosions.create(...)` (line 2473) and `exp.destroy()` (line 2494).
     - Block debris: `this.add.rectangle(...)` (line 2546) and `frag.destroy()` (line 2555).
     - Particles: `this.add.circle(...)` (line 3279) and `spark.destroy()` (line 3288).
     - Items: `this.items.create(...)` (line 3129) and `this.add.circle(...)` (line 3138).
     - Floating texts: `this.add.text(...)` (line 3254) and `floating.destroy()` (line 3271).
     None of these use `ObjectPool<T>`.

3. **`AudioVoicePool.ts` Node Disconnection and Re-initialization (Lines 31–230)**:
   - `AudioVoice` starts oscillators in constructor via `this.osc.start()` (line 60).
   - `AudioVoice` and `AudioVoicePool` contain zero calls to `.disconnect()` or `.stop()`.
   - In `AudioVoicePool.init(ctx)`:
     ```ts
     // src/game/pooling/AudioVoicePool.ts:168-171
     this.voices.length = 0;
     for (let i = 0; i < this.capacity; i++) {
       this.voices.push(new AudioVoice(i, ctx, this.masterBus));
     }
     ```
     Previous voices are abandoned with active audio graph connections.
   - Production game sound is routed through `webAudioSynth` in `src/game/ultimate_skills.ts` (lines 360–535), which creates new `ctx.createOscillator()` and `ctx.createGain()` nodes on every sound without calling `.disconnect()`, and uses unmanaged `window.setTimeout` timers (lines 403, 429).

4. **React DOM Listeners in `BombermanGame.tsx`**:
   - Window listeners `resize`, `keydown`, `keyup` are attached in `useEffect` (lines 372, 418, 419) and cleaned up in return block (lines 468–470).
   - NippleJS joystick is created at line 488 and destroyed via `manager.destroy()` at line 509.
   - `pagehide` and `beforeunload` listeners (lines 280–281) depend on `handleSaveRun` (line 286), which depends on `stats` (line 206), causing continuous re-binding whenever stats update.
   - `showToast` (lines 96–99) invokes `setTimeout(() => setToastMessage(null), 3500)` without an unmounted check or timeout cancellation.

5. **Headless Soak Test Execution**:
   Command: `node --expose-gc --test tests/soak_10k_frames.test.mjs tests/soak_20k_extended.test.mjs`
   Result: Exit code 0, 13/13 passed.
   10k-frame net heap drift: +0.051 MB (threshold <= 0.25 MB).
   20k-frame net heap drift: +0.0076 MB.
   However, `tests/soak_10k_frames.test.mjs` runs `HeadlessSoakSimulator` using mock pools, not `GameScene.ts`.
   In real game loops, `findPathBFS()` (`src/game/pathfinding.ts:600-605`) allocates a new `Array` and `{ r, c }` objects for every step, and `EnemyEntities.ts:347` / `AllyEntities.ts:99` allocate `new Set(bombTiles)` and string keys (`"${r},${c}"`) on every safe-bomb check.

---

## 2. Logic Chain

1. **Step 1 (Phaser Scene Leak)**:
   - Observation 1 shows that `this.game.events.on('mode-changed')` is registered on the global `Phaser.Game` bus during `GameScene.create()`.
   - Because `GameScene` has no `shutdown()` handler, restarting the scene via `this.scene.restart()` retains the callback closure in `this.game.events._events['mode-changed']`.
   - Because the closure references `this` (the old `GameScene`), the entire scene instance, including its physics groups, display lists, and tile maps, cannot be collected by V8 GC.
   - Therefore, repeated player deaths/restarts cause a progressive, linear memory leak.

2. **Step 2 (Object Pool Disconnect)**:
   - Observation 2 demonstrates that `POOL_PRESETS` specifies pool sizes for bombs, explosions, particles, items, and floating text, but `GameScene.ts` directly creates and destroys Phaser GameObjects for each event.
   - In a dynamic Bomberman session with rapid chain explosions, dozens of Phaser GameObjects and Arcade Physics bodies are allocated and destroyed every second.
   - Therefore, mobile web browsers will experience garbage collection pauses (frame stutter), contradicting the Zero-GC architecture goal.

3. **Step 3 (Audio Node Retention)**:
   - Observation 3 shows that `AudioVoicePool` lacks `disconnect()` calls, and `webAudioSynth` creates unpooled oscillator and gain nodes for each ultimate skill without disconnecting them.
   - Furthermore, `webAudioSynth` relies on `window.setTimeout` for 450ms and 280ms sub-bass scheduling, which cannot be cancelled by scene shutdown or pause.
   - Therefore, audio graph nodes accumulate until browser garbage collection, and orphaned timeouts can trigger on unmounted scenes.

4. **Step 4 (DOM Listener Churn)**:
   - Observation 4 shows that while primary listeners (`resize`, `keydown`, `keyup`, NippleJS) are cleaned up on unmount, `handleSaveRun` changes reference on every stat modification.
   - Therefore, `window.addEventListener('pagehide')` and `window.removeEventListener('pagehide')` fire on virtually every frame where stats change, generating unnecessary event registration overhead.

5. **Step 5 (Soak Test Coverage Gap)**:
   - Observation 5 confirms that the soak tests pass with near-zero drift because they exercise an isolated simulation harness (`HeadlessSoakSimulator`) rather than `GameScene`.
   - Helper functions used in the live game (`findPathBFS`, `simulatedBombTiles = new Set(bombTiles)`) generate per-query heap allocations that are absent from the soak test.
   - Therefore, the 10k soak test guarantees the correctness of the typed-array math primitives, but does not validate the memory profile of the active Phaser scene.

---

## 3. Caveats

1. **Headless Execution Environment**: Headless tests run under Node.js with mock DOM/Audio abstractions; native Web Audio internal thread memory was evaluated via code flow analysis of Web Audio API specification behavior rather than browser DevTools memory profiler.
2. **Phaser Internals**: While Phaser's internal `TweenManager` and `Clock` are reset when a scene restarts, references retained via the global `Phaser.Game.events` bus prevent the scene container itself from being reclaimed.
3. **Audio Autoplay Policy**: Web Audio testing was evaluated assuming standard mobile browser policies where `AudioContext` initializes in `'suspended'` state until user gesture.

---

## 4. Conclusion

The codebase memory architecture is fundamentally sound at the typed-array algorithmic level, but contains **one critical leak (P0)**, **two high-impact architectural disconnects (P1)**, and **two moderate performance inefficiencies (P2)**:

1. **[P0] `GameScene.ts:1547`**: Global `game.events.on('mode-changed')` listener leaks the entire `GameScene` on every scene restart.
2. **[P0] `ultimate_skills.ts:360-535`**: `WebAudioSynth` unmanaged oscillator/gain node allocations and unmanaged `setTimeout` timers.
3. **[P1] `GameScene.ts` Pooling Disconnect**: Bombs, blasts, particles, items, and floating text are dynamically instantiated and destroyed rather than recycled through `ObjectPool<T>` / `POOL_PRESETS`.
4. **[P1] `AudioVoicePool.ts` Lifecycle Deficiencies**: Lack of `destroy()` / `disconnect()`, re-init node leaks, and absence of suspended context handling.
5. **[P2] `pathfinding.ts` & AI**: `findPathBFS` and AI bomb safety allocating `GridCoord[]` arrays and `Set<string>` collections on every query.
6. **[P2] `BombermanGame.tsx`**: `pagehide`/`beforeunload` listener churn from un-memoized `handleSaveRun`.

Detailed recommendations and exact remediation strategies are provided in `findings.md`.

---

## 5. Verification Method

1. **Verify Soak Tests & Existing Memory Tests**:
   ```bash
   node --expose-gc --test tests/soak_10k_frames.test.mjs tests/soak_20k_extended.test.mjs tests/unit/object_pool.test.mjs tests/unit/audio_voice_pool.test.mjs
   ```
   *Expected*: All 17 tests pass with exit code 0.

2. **Verify Scene Restart Event Listener Accumulation**:
   Inspect `src/game/GameScene.ts` line 1547:
   - Notice `this.game.events.on('mode-changed', ...)` is called in `create()`.
   - Search for `this.game.events.off('mode-changed')` or `events.once('shutdown')` in `GameScene.ts`.
   - *Result*: No off/cleanup call exists.

3. **Verify Unpooled GameScene Entities**:
   Inspect `src/game/GameScene.ts`:
   - Line 2182: `this.bombs.create(...)`
   - Line 2473: `this.explosions.create(...)`
   - Line 2546: `this.add.rectangle(...)`
   - Line 3129: `this.items.create(...)`
   - Line 3254: `this.add.text(...)`
   - *Result*: None of these use `ObjectPool<T>` or `POOL_PRESETS`.

4. **Verify React Teardown in `BombermanGame.tsx`**:
   Inspect `src/components/BombermanGame.tsx`:
   - Lines 467–482: `useEffect` unmount teardown cleanly destroys `phaserGameRef.current` and removes window resize/keyboard listeners.
   - Lines 276–286: `useEffect` re-runs whenever `handleSaveRun` updates, proving listener churn.
