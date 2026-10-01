# Scout Agent 2: Dynamic Entities, Pooling & Zero-GC Audit Report
**Date:** 2026-10-02  
**Mission:** Dynamic Inspection of Pooling Systems (`ObjectPool.ts`, `AudioVoicePool.ts`, etc.), Entity Subsystems (`src/game/entities/`), Memory Pre-allocation, Typed Arrays, Swap-and-Pop O(1) Mechanics, and Zero-GC Invariants.  
**Auditor:** Scout Agent 2 (Entities, Pooling & Zero-GC)  
**Target File:** `.agents/daily_evolution_20261002/scout_2_entities_pooling.md`

---

## Executive Summary

A comprehensive architectural and dynamic runtime inspection was executed across all object pooling architectures, audio voice synthesis recycling engines, boss/telegraph pooling, and entity lifecycle systems.

### Key Metrics Summary
| Metric / System | Current Status | Specification Budget | Verification Result |
| :--- | :--- | :--- | :--- |
| **ObjectPool Invariant Integrity** | ⚠️ **1 Invariant Defect Found** in `forEachActive()` | Double-release & swap-and-pop O(1) safe | **Cracked**: Releasing inside `forEachActive` skips swapped item & yields `undefined` |
| **10k-Frame Soak Heap Drift** | **+0.0510 MB (+53 KB)** (`--expose-gc`) | $\le$ 0.25 MB | **PASS** (20.4% of maximum budget) |
| **Average Frame Time** | **0.0004 ms (0.4 µs / frame)** | $\le$ 0.50 ms | **PASS** (1,250x execution headroom) |
| **AudioVoicePool Voice Recycling** | 16 persistent voices, 0 WebAudio GC | 16 voice capacity | **PASS** (Zero audio node leaks) |
| **Dynamic Hazard Typed Array Bitmasks** | 195-tile 1D TypedArrays (`Uint8Array`, `Float32Array`) | Zero heap allocations in 60 FPS update | **PASS** |
| **Entity Overhead UI Dirty Caching** | Graphics cleared/redrawn only on state change | Zero redraw on identical position/HP | **PASS** |
| **Entity AI Danger Check Allocations** | Per-frame `new Set<string>()` in Merchant AI | Zero heap allocations per frame | ⚠️ **Optimization Target** |

---

## 1. Object Pooling Architecture & Invariant Analysis (`ObjectPool.ts`)

### 1.1 Structural Implementation
`ObjectPool<T>` in `src/game/pooling/ObjectPool.ts` implements a contiguous flat storage pool:
- **Pre-allocation:** Pre-allocates `storage = new Array<T>(capacity)` at constructor instantiation.
- **Typed Array Index Management:**
  - `freeIndices: Int32Array(capacity)`: Stack of available indices with `freeHead`.
  - `activeIndices: Int32Array(capacity)`: Contiguous active item indices.
  - `itemToActiveSlot: Int32Array(capacity)`: Reverse mapping from storage index to active slot for O(1) removal.
  - `activeFlags: Uint8Array(capacity)`: 1-byte flag (0 or 1) indicating active status.
- **Fast Object Lookup:** `itemToIndexMap: Map<T, number>` populated once at construction, providing O(1) object-to-index lookup with zero runtime allocations.
- **Double-Release & Foreign Object Guards:**
  - Releasing an unmanaged object immediately returns `false`.
  - Releasing an already-released object (`activeFlags[itemIndex] === 0`) returns `false`, preventing free list corruption.
- **Safe Callback Encapsulation:** `try / catch` wraps around user-provided `reset` and `onAcquire` callbacks, ensuring that exceptions in entity reset logic cannot desynchronize pool indices.

### 1.2 Critical Defect Discovered: `forEachActive()` Swap-and-Pop Desynchronization
During dynamic fuzzing and integration verification with `BossAttackManager.update()`, a critical invariant violation was discovered:

```typescript
// Current ObjectPool.ts implementation:
public forEachActive(callback: (item: T, index: number) => void): void {
  const count = this._activeCount;
  for (let i = 0; i < count; i++) {
    const itemIndex = this.activeIndices[i];
    callback(this.storage[itemIndex], i);
  }
}
```

#### Defect Breakdown:
1. `count` is cached at the start of the loop (`const count = this._activeCount;`).
2. When the callback releases the active item at slot `i` (as happens during collision detection in `BossAttackManager` or particle lifecycles):
   - `release()` performs swap-and-pop: the item at `lastSlot` (`this._activeCount - 1`) is moved into slot `i`.
   - `this.activeIndices[lastSlot]` is set to `-1`.
   - `this._activeCount` is decremented.
3. The forward loop increments `i` to `i + 1`:
   - **Issue A (Skipped Entity):** The item swapped into slot `i` is **never visited** during this frame.
   - **Issue B (Runtime Crash):** When `i` reaches `count - 1`, `this.activeIndices[i]` is `-1`. `this.storage[-1]` returns `undefined`, and `callback(undefined, i)` is called.
4. **Reproduced Impact:** In `BossAttackManager.update()`, spawning 2 projectiles where projectile 0 expires instantly crashes with:
   `TypeError: Cannot read properties of undefined (reading 'x')`.

#### Recommended Zero-GC Fix:
Use a `while` loop that inspects whether the item at slot `i` was released/moved before advancing `i`:
```typescript
public forEachActive(callback: (item: T, index: number) => void): void {
  let i = 0;
  while (i < this._activeCount) {
    const itemIndex = this.activeIndices[i];
    if (itemIndex < 0 || this.activeFlags[itemIndex] === 0) {
      i++;
      continue;
    }
    const item = this.storage[itemIndex];
    callback(item, i);
    // If the callback released the item, swap-and-pop placed a new item in slot i.
    // In that case, itemToActiveSlot[itemIndex] is now -1, so do NOT increment i.
    if (this.itemToActiveSlot[itemIndex] !== i) {
      // Slot i now holds the swapped item; evaluate slot i on the next iteration.
    } else {
      i++;
    }
  }
}
```

---

## 2. Capacity Utilization & Pool Presets

### 2.1 Mandated vs Configured Presets
`POOL_PRESETS` in `src/game/pooling/ObjectPool.ts` vs Actual Subsystem Usage:

| Preset Name | Standard Capacity | Subsystem Location | Soak Peak Usage | Utilization Rate | Headroom Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `BOMBS` | 32 | `HeadlessSoakSimulator` | 2 | 6.25% | Generous (30 free) |
| `EXPLOSIONS` | 128 | `HeadlessSoakSimulator` | 5 | 3.91% | Generous (123 free) |
| `PARTICLES` | 256 | `HeadlessSoakSimulator` | 16 | 6.25% | Generous (240 free) |
| `ITEM_DROPS` | 48 | Item Spawn Systems | ~6 | 12.50% | Safe (42 free) |
| `FLOATING_TEXT` | 32 | `FloatingTextManager` (1024 Ring) | ~8 | 25.00% | Ring buffer prevents exhaustion |
| `GHOST_BOMBS` | 16 | `DynamicHazard.ts` | 4 | 25.00% | Safe (12 free) |
| `HAZARD_BEAM_TILES` | 32 | `DynamicHazard.ts` | 14 | 43.75% | Safe (18 free) |
| `BOSS_PROJECTILES` | 64 | `BossAttackManager.ts` | ~12 | 18.75% | Safe (52 free) |
| `BOSS_SHOCKWAVES` | 16 | `BossAttackManager.ts` | 2 | 12.50% | Safe (14 free) |
| `BOSS_MINIONS` | 8 (max 4 active) | `BossAttackManager.ts` | 4 | 50.00% | Clamped by boss logic |
| `TELEGRAPH_TILES` | 64 | `TelegraphEngine.ts` | 24 | 37.50% | Safe (40 free) |

All pools operate well within capacity limits with zero observed buffer overflows or memory leaks under stress.

---

## 3. Web Audio Voice Recycling Engine (`AudioVoicePool.ts`)

### 3.1 Status & Lifecycle
`AudioVoicePool` provides procedural sound generation with zero WebAudio node garbage collection:
- **Pre-allocation:** Creates 16 `AudioVoice` instances at initialization.
- **Node Graph:** `OscillatorNode -> BiquadFilterNode -> GainNode -> masterBus (0.85 gain) -> ctx.destination`.
- **Persistent Oscillators:** Oscillators are started once (`this.osc.start()`) in silent quiescent state (`gain.value = 0`). Dynamic frequency, waveform (`sine`, `triangle`, `sawtooth`, `square`), and envelope automations are applied in-place.
- **Click-Free Voice Stealing:**
  - If all 16 voices are active, the pool identifies the voice nearest to completion (`minRemaining`).
  - It triggers `forceSilence()`: a 3ms linear ramp to `0.0001` before reassigning parameters, completely preventing speaker pops and clicks.
- **Teardown Invariants:** `destroy()` cleanly invokes `osc.stop()`, disconnects all nodes, clears internal arrays, and nullifies the context reference.

### 3.2 Adoption Status Across Subsystems
- **`DynamicHazardAudio.ts`**: **100% Adopted.** Uses `AudioVoicePool` for:
  - Nexus Beam Hums, Pings, Zaps, and Chimes.
  - Crystalline D Major 9th Chord (D5, F#5, A5, E6) synthesized across 4 pooled voices simultaneously.
  - Quantum Tunneling Swoop/Chime, Subspace Hyper-Fuse click, Tachyon Overcharge, and Minion Vaporization.
- **`WebAudioSynth.ts` (`src/game/ultimate_skills.ts`)**: **Not Yet Adopted.**
  - `WebAudioSynth` currently instantiates transient `ctx.createOscillator()` and `ctx.createGain()` nodes per sound effect, attaching `osc.onended` for auto-disconnection.
  - While memory leaks are prevented by `wireAutoDisconnect()`, frequent ultimate casts generate short-lived audio node garbage.
  - **Optimization Target:** Wire `WebAudioSynth` to share or utilize `AudioVoicePool`.

---

## 4. Entity Subsystem & Lifecycle Audit (`src/game/entities/`)

### 4.1 Archetype Inventory
The entity system defines 10 distinct archetypes across 3 factions:
1. **Enemies (`EnemyEntities.ts`):**
   - `ChaserEnemy` (Blinky): 1 HP, 70 patrol / 110 track / 240 dash speed, 350ms windup, 900ms wall stun.
   - `BomberEnemy` (Pyro): 2 HP, strategic bomb planting, 1 HP Enrage state (105 speed), cul-de-sac suicide refusal.
   - `TankEnemy` (Iron Golem): 4 HP, 45 walk / 130 charge speed, 1200ms i-frame defense, crushes soft blocks while preserving concealed items.
   - `GhostEnemy` (Phantasm): 1 HP, phases through breakable soft blocks via specialized BFS, halted by indestructible walls, 1500ms materialize delay.
   - `SplitterEnemy` (Gelatin): 2 HP, splits into 2 `MiniSplitterEnemy` (1 HP, 100 speed) on death.
2. **Neutrals (`NeutralEntities.ts`):**
   - `MerchantNPC` (Pops): 3 HP, 40 walk speed, flees ticking bombs, pauses for trade, drops 2 protected power-ups on cart destruction.
   - `CritterNPC` (Fluff): 1 HP, 35 hop speed, 25% distraction roll (`💖`), yields +200 score bonus on blast.
3. **Allies (`AllyEntities.ts`):**
   - `MiniBomberAlly` (Pom-Pom): 3 HP, dynamic leash (2-6 tiles), strict zero friendly-fire bomb planting.
   - `PetDroneAlly` (Gizmo): 2 HP, 120 flight speed, tractor beam item retrieval, 1000ms stun peashooter.
   - `ShieldGuardAlly` (Aegis): 5 HP vanguard tank, 4000ms taunt wave, Aegis dome absorbs bomb blast to protect player.

### 4.2 Physics Body Invariant Guard (`applyPhysicsBodyInvariantGuard`)
- All entities utilize `applyPhysicsBodyInvariantGuard(this, 24, 24, 8, 8)`.
- Overrides `updateBounds()` and `updateFromGameObject()` on Arcade Physics Body.
- Guarantees that squash-and-stretch animations (`setScale`), walking hop animations, and hover bobbing (`displayOriginY`) **never** resize or displace the physical AABB collision box, eliminating corner snagging and wall tunneling.

### 4.3 3-Tier Overhead UI (`OverheadUI.ts` & `OverheadUIManager`)
- **Tier 1 (y - 14):** Segmented HP Bar (24x4px, segmented by `maxHp`).
  - **Dirty State Caching:** `renderHpBar()` caches `lastRenderedHp`, `lastRenderedBarX`, `lastRenderedBarY`, `lastRenderedFaction`, and `lastRenderedColor`. If parameters are identical, `hpGraphics.clear()` and redraw calls are skipped entirely, saving substantial canvas/WebGL CPU draw calls.
- **Tier 2 (y - 22):** Name Tag with 3 Adaptive LOD Modes:
  - `full`: Full name (distance > 70px).
  - `compact`: Nickname (distance $\le$ 70px).
  - `minimal`: Text hidden; HP and Intent glyph only (when 3+ entities cluster within 60px).
- **Tier 3 (y - 34):** Intent Badge / Status Emoji (`!`, `💨`, `⚠️`, `⚡`, `💫`, `🛡️`, `🛒`, `😱`).
- **`OverheadUIManager` in `GameScene.ts`:**
  - Maintains pre-allocated scratch buffer `_scratchActive: DeclutterEntity[] = []` (`length = 0` per frame).
  - Dynamic typed arrays `_offsetsX: Float32Array` and `_offsetsY: Float32Array`.
  - Continuous 2.5D dynamic Y-sorting depth pass: `depth = ENTITY_Y_BASE + y * ENTITY_Y_SCALE`.
  - Player protection bubble (R = 38px) with smooth exponential alpha decay.

---

## 5. Zero-GC Optimization Targets

While core engines (Pathfinding, TelegraphEngine, FloatingTextManager, DynamicHazard) achieve near-zero GC, several optimization opportunities exist in entity updates and Phaser scene interactions:

### Target 1: `MerchantNPC.updateAI()` Heap Allocations
- **File:** `src/game/entities/NeutralEntities.ts` (lines 87-98)
- **Current Issue:** In the danger evaluation loop, `MerchantNPC` creates:
  ```typescript
  const allBlastTiles = new Set<string>();
  const bombSet = cloneBombTilesAsSet(bombTiles);
  for (const bKey of bombSet) {
    const [br, bc] = bKey.split(',').map(Number);
    ...
  }
  ```
- **GC Impact:** String splitting, coordinate object creation, and `Set<string>` allocations every frame near bombs.
- **Remediation:** Replace with `FlatHazardMask` or reusable scratch bitmask buffers.

### Target 2: Entity Path Slice / Shift
- **Files:** `EnemyEntities.ts`, `AllyEntities.ts`, `NeutralEntities.ts`
- **Current Issue:** AI paths use `GridCoord[]` arrays and call `this.escapePath.shift()`.
- **GC Impact:** `Array.prototype.shift()` re-indexes arrays and causes minor garbage when generating replacement paths.
- **Remediation:** Track a `pathStepIndex: number` pointer instead of shifting, or use `Int16Array` path buffers from `zeroGCPathfinder`.

### Target 3: Entity Death Particle Burst
- **File:** `src/game/entities/BaseEntity.ts` (lines 225-238)
- **Current Issue:** Dying entities create 6 new `Phaser.GameObjects.Arc` circles and 6 Tweens per death.
- **Remediation:** Pool death spark particles using `POOL_PRESETS.PARTICLES` or Phaser particle emitter.

### Target 4: `GameScene.ts` Bomb & Explosion Pooling
- **File:** `src/game/GameScene.ts` (lines 3090, 3788)
- **Current Issue:** Bombs and explosions are instantiated via `this.bombs.create()` / `this.explosions.create()` and destroyed via `destroy()`.
- **Status:** `POOL_PRESETS` specifies `BOMBS: 32` and `EXPLOSIONS: 128`. Integrating `ObjectPool` directly for Phaser sprite recycling in `GameScene` will eliminate all sprite lifecycle GC spikes during 50-bomb chain cascades.

---

## 6. Actionable Recommendations for Implementation Agents

1. **[CRITICAL / IMMEDIATE] Fix `ObjectPool.forEachActive()` Invariant**:
   Implement the while-loop safe traversal in `src/game/pooling/ObjectPool.ts` to support in-loop item releases without skipping swapped items or invoking callbacks with `undefined`. Add permanent unit test coverage in `tests/unit/object_pool.test.mjs`.
2. **[HIGH] Refactor `MerchantNPC` Danger Check**:
   Replace `new Set<string>()` and string splitting in `NeutralEntities.ts` with flat integer bitmask checks.
3. **[MEDIUM] WebAudioSynth Voice Pool Integration**:
   Migrate `WebAudioSynth` in `src/game/ultimate_skills.ts` to utilize `AudioVoicePool` instead of ad-hoc node creation.
4. **[STRATEGIC] GameScene Sprite Pool Adoption**:
   Hook `POOL_PRESETS.BOMBS` and `POOL_PRESETS.EXPLOSIONS` into `GameScene.ts` to eliminate Sprite / Arcade Body allocation during intense bomb combat.
