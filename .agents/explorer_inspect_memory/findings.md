# Memory Leaks, Object Pooling & Performance Inspection Report

**Milestone**: Total Inspection ("총검사") — Stage 1  
**Inspector**: Memory Leaks & Performance Inspector (`explorer_inspect_memory`)  
**Date**: 2026-09-18  
**Scope**: `ObjectPool<T>`, `AudioVoicePool.ts`, `GameScene.ts`, `BombermanGame.tsx`, Web Audio synthesis, `tests/soak_10k_frames.test.mjs`, `tests/soak_20k_extended.test.mjs`

---

## Executive Summary

The Bomberman codebase possesses high-performance zero-allocation building blocks (`ZeroGCPathfinder`, `FlatHazardMask`, `CameraTraumaSimulator`, and `ObjectPool<T>`), which pass 10,000-frame and 20,000-frame headless soak tests with minimal heap drift (< 0.05 MB). 

However, a forensic audit reveals **critical architectural disconnects and memory leaks** between these isolated zero-GC primitives and the live production game loop:
1. **Critical Phaser Scene Memory Leak**: `GameScene.ts` subscribes an anonymous closure to `this.game.events.on('mode-changed')` during `create()`. Because `this.game.events` is the global game event bus and `GameScene` has no `shutdown()` or `destroy()` teardown handler, every `scene.restart()` retains a closure holding the entire previous `GameScene` instance, all its physics groups, and display lists in memory.
2. **Production vs Pool Preset Disconnect**: While `POOL_PRESETS` (`ObjectPool.ts`) defines capacities for Bombs (32), Explosions (128), Particles (256), Item Drops (48), and Floating Texts (32), `GameScene.ts` **does not use `ObjectPool<T>`** for these entities. Instead, it dynamically allocates and destroys Phaser Sprites, Shapes, and Texts via `this.bombs.create()`, `this.explosions.create()`, `this.add.rectangle()`, `this.add.circle()`, and `this.add.text()`.
3. **Web Audio Lifecycle & Node Abandonment**: `AudioVoicePool.ts` starts persistent oscillators (`this.osc.start()`) in quiescent mode but lacks any `destroy()` or `disconnect()` method. Re-calling `AudioVoicePool.init(ctx)` empties the `voices` array without stopping or disconnecting existing audio nodes. Furthermore, production game audio completely bypasses `AudioVoicePool`, relying on a global singleton `webAudioSynth` that instantiates unpooled audio nodes and unmanaged `window.setTimeout` timers on every sound.
4. **Game Loop Allocations & Pathfinding Garbage**: While `ZeroGCPathfinder` is zero-allocation internally, the high-level helper `findPathBFS()` allocates a new array and `{ r, c }` objects for every path step on every query, and AI entities allocate `new Set(bombTiles)` and string keys (`"${r},${c}"`) every frame they consider placing a bomb.
5. **React DOM Listener Lifecycle**: `BombermanGame.tsx` cleans up `resize`, `keydown`, `keyup`, and NippleJS joystick listeners cleanly on unmount. However, `pagehide`/`beforeunload` listeners suffer from unnecessary recreation churn on every stats change, and `showToast` has an uncancelled `setTimeout` callback.

---

## Detailed Findings by Area

### 1. `ObjectPool<T>` & Entity Pooling Correctness

#### 1.1 Architecture & Internal Invariants
- **File**: `src/game/pooling/ObjectPool.ts` (Lines 15–169)
- **Strengths**:
  - Implements dense O(1) swap-and-pop release and O(1) acquire using typed arrays (`Int32Array`, `Uint8Array`).
  - Active index swapping maintains a contiguous array of active elements, avoiding holes.
  - Implements a double-release guard (`if (this.activeFlags[itemIndex] === 0) return false;`).
- **Defects & Vulnerabilities**:
  1. **Lack of Lifecycle Teardown (`destroy` / `dispose`)**: `ObjectPool<T>` holds hard references to all pre-allocated objects in `this.storage: T[]` and `this.itemToIndexMap: Map<T, number>`. If an instance is decommissioned, all pooled objects remain strongly referenced.
  2. **Exception Desynchronization in `release()`**:
     ```ts
     // ObjectPool.ts:106-109
     this.activeFlags[itemIndex] = 0;
     if (this.resetCallback) {
       this.resetCallback(item);
     }
     ```
     If `resetCallback(item)` throws an exception, `activeFlags` has already been marked 0, but `_activeCount` has not been decremented and indices have not been swapped. The pool enters an irrecoverably desynchronized state.
  3. **Stale State Leak in `BossAttackManager.ts`**:
     - `BossAttackManager.ts` (Lines 26–51, 75–97):
       - `projectilePool` reset callback:
         ```ts
         reset: (p) => {
           p.active = false;
           p.vx = 0;
           p.vy = 0;
           p.timerMs = 0;
           p.homing = false;
         }
         ```
         `targetX`, `targetY`, `radius`, `damage`, and `maxDurationMs` are NOT reset! If a homing or custom radius projectile was acquired previously, the next consumer will inherit stale coordinate targets or damage values.
       - `minionPool` reset callback:
         ```ts
         reset: (m) => {
           m.active = false;
           m.hp = 1;
           m.targetTileIdx = -1;
           m.carriedBombId = -1;
         }
         ```
         `x`, `y`, `vx`, `vy`, and `state` are NOT reset.
       - `shockwavePool` reset callback: `originX`, `originY`, `maxRadius`, `expansionSpeed`, and `damage` are NOT reset.

#### 1.2 The Production Game Disconnect
- **File**: `src/game/GameScene.ts`
- `POOL_PRESETS` in `ObjectPool.ts:174-180`:
  ```ts
  export const POOL_PRESETS = {
    BOMBS: 32,
    EXPLOSIONS: 128,
    PARTICLES: 256,
    ITEM_DROPS: 48,
    FLOATING_TEXT: 32,
  } as const;
  ```
- **Finding**: In `GameScene.ts`, none of these entities are managed by `ObjectPool<T>`:
  - **Bombs**: Dynamically allocated via `this.bombs.create(...)` (`GameScene.ts:2182, 2270, 2341`) and destroyed via `bomb.destroy()` (`GameScene.ts:2373`).
  - **Explosions**: Dynamically allocated via `this.explosions.create(...)` (`GameScene.ts:2473`) and destroyed via `exp.destroy()` (`GameScene.ts:2494`).
  - **Block Debris Particles**: 4 rectangular sprites allocated per broken block (`this.add.rectangle(...)`, `GameScene.ts:2546`) and destroyed on tween completion (`GameScene.ts:2555`).
  - **Sparks & VFX**: Dynamically allocated circles (`this.add.circle(...)`, `GameScene.ts:2589, 3279`) and destroyed on tween completion.
  - **Item Drops**: Dynamically allocated via `this.items.create(...)` (`GameScene.ts:3129`) + circle glow (`GameScene.ts:3138`).
  - **Floating Texts**: Dynamically allocated via `this.add.text(...)` (`GameScene.ts:3254`) and destroyed via `floating.destroy()` on tween completion (`GameScene.ts:3271`).
- **Impact**: In heavy gameplay (multiple simultaneous bomb blasts, chain reactions, block crumbling), dozens of Phaser GameObjects, Arcade Physics Bodies, and tween objects are allocated and discarded per second, triggering JavaScript GC pauses on low-memory mobile devices.

---

### 2. `AudioVoicePool` & Web Audio API Analysis

#### 2.1 `AudioVoicePool.ts` Lifecycle Deficiencies
- **File**: `src/game/pooling/AudioVoicePool.ts` (Lines 31–230)
- **Defects**:
  1. **No Node Teardown or Disconnect**:
     `AudioVoice` instantiates `ctx.createOscillator()`, `ctx.createBiquadFilter()`, and `ctx.createGain()`. In constructor:
     ```ts
     this.osc.start();
     ```
     These oscillators run continuously. When quiet, gain is set to 0. However:
     - `AudioVoice` has no `disconnect()` or `stop()` method.
     - `AudioVoicePool` has no `destroy()` or `close()` method.
  2. **Voice Leak on Re-initialization**:
     In `AudioVoicePool.init(ctx)`:
     ```ts
     // AudioVoicePool.ts:168-171
     this.voices.length = 0;
     for (let i = 0; i < this.capacity; i++) {
       this.voices.push(new AudioVoice(i, ctx, this.masterBus));
     }
     ```
     If `init()` is called again with a new context (or upon game remount), the old `AudioVoice` objects in `voices` are abandoned without calling `disconnect()` or `stop()`. Their running oscillators remain attached to the previous audio graph.
  3. **Suspended Context Desynchronization**:
     - `AudioVoice.play()` queries `ctx.currentTime`. On modern mobile browsers, `AudioContext` initializes in `'suspended'` state pending user gesture.
     - While suspended, `ctx.currentTime` is static (0).
     - `voice.endTime = totalEnd` is calculated against static time.
     - `voice.isBusy` remains `true` because `now < voice.endTime` never advances, forcing the pool into perpetual voice stealing on subsequent tone requests.
     - `AudioVoicePool` lacks any `ctx.state === 'suspended'` guard or `ctx.resume()` call.
  4. **No BufferSource Pooling**:
     The pool only models synthesized tone voices; there is no buffer pool or sample playback support.

#### 2.2 Production Audio: `WebAudioSynth` in `src/game/ultimate_skills.ts`
- **File**: `src/game/ultimate_skills.ts` (Lines 360–535)
- **Finding**: Production sound synthesis completely ignores `AudioVoicePool`!
  - `GameScene.ts` imports the global singleton `webAudioSynth = new WebAudioSynth()`.
  - Every sound effect (`playMeteorWhistleAndBoom`, `playSuperNovaShockwave`, `playSubBassBoom`, `playChronoFreeze`, `playNuclearLaunch`, etc.) creates brand new unpooled nodes:
    ```ts
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    ...
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
    ```
  - **Missing Disconnect**: Neither `osc.disconnect()` nor `gain.disconnect()` is ever scheduled or called. The disconnected audio subgraphs rely entirely on browser GC to reclaim native audio resources.
  - **Unmanaged Timer Leaks**:
    ```ts
    // ultimate_skills.ts:403
    setTimeout(() => { this.playSubBassBoom(0.7, 55, 20); }, 450);
    // ultimate_skills.ts:429
    setTimeout(() => { this.playSubBassBoom(1.0, 90, 20); }, 280);
    ```
    These timeouts use global `window.setTimeout`. If the game scene restarts or component unmounts during these intervals, the timeouts still trigger and attempt to play audio on an unmounted context.

---

### 3. Phaser Textures, Tweens, Timers & Scene Lifecycle

#### 3.1 Critical Scene Event Listener Leak
- **File**: `src/game/GameScene.ts` (Line 1547)
- **Code**:
  ```ts
  // GameScene.ts:1546-1553
  // Wire Game Mode Changes for Boss Encounters
  this.game.events.on('mode-changed', (mode: string) => {
    if (mode === 'boss_rush' || mode === 'BOSS_RUSH') {
      this.startBossEncounter('king_gummy_bear');
    } else if (this.activeBoss) {
      this.dismissBoss();
    }
  });
  ```
- **Mechanism**:
  - `this.game.events` is the **global `Phaser.Game` EventEmitter**, which outlives individual scene instances.
  - When the player dies or restarts (`GameScene.ts:2643`: `this.scene.restart()`), `create()` runs again.
  - A new anonymous callback is added to `this.game.events.on('mode-changed')`.
  - The previous callback is never unregistered because `GameScene` has no `shutdown()` method and does not call `this.game.events.off('mode-changed')`.
- **Impact**:
  - Each restart leaks the previous `GameScene` instance in memory via closure reference.
  - In a 10-restart play session, 10 zombie scenes receive the `mode-changed` event, spawning bosses or attempting actions on destroyed scenes.

#### 3.2 Dynamic Textures Lifecycle
- **File**: `src/game/GameScene.ts` (Lines 3682–3725)
- **Observation**:
  `generateItemTextures()` checks `if (this.textures.exists(key)) return;` before generating procedural canvas textures.
- **Verdict**: **Clean**. Dynamic procedural textures are not duplicated on scene restart.

#### 3.3 Dynamic Tweens & Timers Cleanup
- **Timers**:
  - `explodeBomb()` explicitly removes `fuseTimer`:
    ```ts
    const timer = bomb.getData('fuseTimer') as Phaser.Time.TimerEvent | undefined;
    if (timer) timer.remove(false);
    ```
  - `tweenChain`: stopped via `chain.stop()`.
- **Enemies & Overhead UI**:
  - `Enemy.destroy()` calls `this.stopStateTweens()`, killing tweens on `this` and `this.indicator`.
  - `OverheadUI.destroy()` destroys `hpGraphics`, `nameTag`, and `indicator`.
  - **Minor Risk in OverheadUI**:
    ```ts
    // OverheadUI.ts:198
    if (this.hpGraphics && this.hpGraphics.active) {
      this.hpGraphics.destroy();
      this.hpGraphics = null;
    }
    ```
    If `hpGraphics` was set to `active = false` (hidden), `destroy()` is skipped, leaving the graphic object in Phaser's display list. It should check `if (this.hpGraphics)` without requiring `active`.

---

### 4. React DOM Listener Leaks in `BombermanGame.tsx`

#### 4.1 Window & Keyboard Listeners
- **File**: `src/components/BombermanGame.tsx` (Lines 362–483)
- **Observation**:
  - `resize` -> `window.removeEventListener('resize', checkMobile)`
  - `keydown` -> `window.removeEventListener('keydown', handleKeyDown)`
  - `keyup` -> `window.removeEventListener('keyup', handleKeyUp)`
  - `phaserGame.destroy(true)` is called on component unmount.
  - Event listeners on `phaserGame.events` (`stats-update`, `boss-hud-update`, `currency-reward`) are explicitly unregistered via `.off()`.
- **Verdict**: **Clean**. Window and keyboard listeners are fully detached on unmount.

#### 4.2 NippleJS Joystick Teardown
- **File**: `src/components/BombermanGame.tsx` (Lines 486–512)
- **Observation**:
  - In `useEffect([isMobile])`:
    ```ts
    return () => {
      manager.destroy();
    };
    ```
- **Verdict**: **Clean**. The NippleJS DOM elements and event listeners are cleanly destroyed when `isMobile` changes or the component unmounts.

#### 4.3 Re-subscription Churn on `pagehide` / `beforeunload`
- **File**: `src/components/BombermanGame.tsx` (Lines 276–286)
- **Code**:
  ```ts
  useEffect(() => {
    const handlePageHide = () => {
      handleSaveRun('page_hide');
    };
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, [handleSaveRun]);
  ```
- **Issue**:
  - `handleSaveRun` is defined with `useCallback(..., [selectedMode, stats, showToast])`.
  - Every time `stats` changes (e.g. picking up an item, placing a bomb, moving), `handleSaveRun` changes identity.
  - This causes `window.removeEventListener` and `window.addEventListener` for `pagehide` and `beforeunload` to execute continuously during active gameplay.
- **Remediation**: Use a `useRef` to store the latest `stats` and `selectedMode`, making `handleSaveRun` reference-stable and avoiding re-attaching listeners.

#### 4.4 Unmounted Component State Update in `showToast`
- **File**: `src/components/BombermanGame.tsx` (Line 96–99)
- **Issue**:
  `setTimeout(() => setToastMessage(null), 3500)` does not track unmount state or clear the timeout on unmount, which can lead to React warnings if unmounted within 3.5 seconds.

---

### 5. Soak Test Analysis & Game Loop Allocations

#### 5.1 Analysis of Existing Soak Tests
- **Files**: `tests/soak_10k_frames.test.mjs`, `tests/soak_20k_extended.test.mjs`
- **Test Results**:
  - 10,000 continuous frames: Net heap drift +0.051 MB (well within 0.25 MB threshold).
  - 20,000 extended frames: Net heap drift +0.0076 MB (433 ms total test duration).
- **Critical Insight**:
  - The soak test evaluates `HeadlessSoakSimulator`, which is a lightweight custom model.
  - It proves that **if** entities are pooled and **if** `ZeroGCPathfinder` and `CameraTraumaSimulator` with scratch vectors are used, JavaScript execution produces practically zero GC drift.
  - **However, `HeadlessSoakSimulator` is not `GameScene.ts`**. The production game loop does not employ these pools.

#### 5.2 Hidden Allocations in Production Game Loops
1. **`findPathBFS()` in `src/game/pathfinding.ts` (Lines 600–605)**:
   ```ts
   const path: GridCoord[] = new Array(len);
   for (let i = 0; i < len; i++) {
     const idx = outPathBuffer[i];
     path[i] = { r: (idx / COLS) | 0, c: idx % COLS };
   }
   return path;
   ```
   Even though `zeroGCPathfinder` writes to an internal `Int16Array`, `findPathBFS()` creates a new array and multiple `{ r, c }` coordinate objects for every AI path query.
2. **`Set<string>` and String Allocations in Entity AI**:
   - `AllyEntities.ts:99`: `const simulatedBombs = new Set(bombTiles);`
   - `EnemyEntities.ts:347`: `const simulatedBombTiles = new Set(bombTiles);`
   - `pathfinding.ts:216-224`: Iterating over `FlatHazardMask` yields formatted template strings (`"${r},${c}"`).
   - Every time Bomber enemies or Mini-Bomber allies check whether it is safe to drop a bomb, they allocate a new `Set` and multiple strings.
3. **Cardinal Direction Arrays in Explosions**:
   - `GameScene.ts:2426-2431` and `pathfinding.ts:620-625`:
     ```ts
     const directions = [
       { dr: -1, dc: 0 },
       { dr: 1, dc: 0 },
       { dr: 0, dc: -1 },
       { dr: 0, dc: 1 },
     ];
     ```
     Allocated anew inside every single bomb explosion.

---

## Prioritized Remediation Action Plan (Stage 2)

| Priority | Component | Defect / Issue | Proposed Action |
|---|---|---|---|
| **P0** | `GameScene.ts` | Global EventEmitter leak on `this.game.events.on('mode-changed')` | Implement `shutdown()` lifecycle hook in `GameScene` to call `this.game.events.off('mode-changed')`, or register the listener on `this.events` (scene-level). |
| **P0** | `ultimate_skills.ts` | `WebAudioSynth` unmanaged nodes & `setTimeout` calls | Connect audio nodes through a managed gain node, call `disconnect()` upon playback completion, and replace `window.setTimeout` with Phaser scene clock delayed calls. |
| **P1** | `AudioVoicePool.ts` | No `destroy()` / `disconnect()` methods; re-init leaks nodes; suspended ctx freeze | Add `destroy()` and `disconnect()` to `AudioVoice` and `AudioVoicePool`; clean up existing voices in `init()`; add `ctx.state` checks. |
| **P1** | `GameScene.ts` | Unpooled allocations for bombs, explosions, debris, particles | Migrate dynamic `create()`/`destroy()` calls to utilize `ObjectPool<T>` (or Phaser Group recycling) per `POOL_PRESETS`. |
| **P1** | `pathfinding.ts` & AI | `findPathBFS` and AI bomb safety allocating arrays, Sets, and strings | Provide zero-allocation index-based path return methods (`Int16Array`) and typed-array hazard checks without string conversions. |
| **P2** | `BombermanGame.tsx` | `handleSaveRun` dependency churn causing constant listener re-attaches | Store `stats` and `selectedMode` in `useRef` to stabilize `handleSaveRun` callback. |
| **P2** | `OverheadUI.ts` | `destroy()` skips inactive graphics | Remove `.active` check in `hpGraphics.destroy()` to ensure inactive display objects are freed. |
| **P2** | `BossAttackManager.ts` | Incomplete pool resets (`targetX`, `targetY`, `state`, etc.) | Ensure all mutable properties are reset in pool `reset` callbacks. |
