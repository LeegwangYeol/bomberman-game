# Architect 5 Audit Report: FSM State Transitions & Event Listeners Audit
**Division:** Architect & Zero-GC Division  
**Target Files:** `src/game/entities/EnemyEntities.ts`, `src/game/GameScene.ts`  
**Cross-References:** `src/game/entities/BaseEntity.ts`, `src/game/entities/OverheadUI.ts`, `src/components/BombermanGame.tsx`, `src/game/bosses/BaseBoss.ts`, `src/game/crises/CrisisManager.ts`  
**Date:** September 30, 2026  
**Auditor:** Architect 5 (Subagent ID: `d6fe8482-c784-4dd6-8de2-2c3e4cfab327`)

---

## 1. Executive Summary

This audit rigorously evaluates the finite state machine (FSM) state transitions and event listener lifecycles across `src/game/entities/EnemyEntities.ts` and `src/game/GameScene.ts`. Our dual objective:
1. **Zero-GC FSM State Transitions:** Verify that state changes, transitions, and state evaluations execute without allocating transient closures (arrow functions, anonymous callbacks) or disposable objects on the heap.
2. **Clean Lifecycle & Listener Deregistration:** Ensure all event listeners attached to Phaser internal buses (`scene.events`, `game.events`, `input.keyboard`, `physics.world`) or browser DOM APIs (`window`, `document`) are strictly paired with complete and idempotent teardown in `shutdown()` and `destroy()`.

### Summary Scorecard

| Domain | Target Component | Status | Closures in State Changes | Teardown Completeness |
|---|---|---|---|---|
| **Enemy FSM** | `ChaserEnemy` | ✅ PASS | 0 closures | Clean (via `BaseEntity.destroy`) |
| **Enemy FSM** | `BomberEnemy` | ✅ PASS | 0 closures | Clean (via `BaseEntity.destroy`) |
| **Enemy FSM** | `TankEnemy` | ⚠️ WARNING | **1 recurring closure** (delayedCall) | Stomp timer callback uncancelled on destroy |
| **Enemy FSM** | `GhostEnemy` | ✅ PASS | 0 closures | Clean (pure delta-tick timers) |
| **Enemy FSM** | `SplitterEnemy` / `Mini` | ⚠️ PASS* | 0 in state, 1 onDeath | Arrow function allocated in `onDeath.filter` |
| **Entity Base** | `BaseEntity` | ⚠️ PASS* | Flash & death tweens allocate closures | `dropShadow` & `OverheadUI` cleanly destroyed |
| **Scene FSM** | `GameScene` (Macro States) | ⚠️ WARNING | Closures in HitStop, Dash, Bomb Fuses | Clean delta-checks for invulnerability |
| **Scene Listeners** | `GameScene` (`game.events`) | ✅ PASS | Bound method references used | Fully unregistered in `shutdown()` |
| **Scene Teardown** | `GameScene` (`shutdown()`) | ⚠️ WARNING | 0 closures | Missing `DESTROY` hook, keyboard keys unremoved |
| **DOM Listeners** | React Bridge (`BombermanGame`) | ✅ PASS | 0 closures in listeners | All 5 DOM listeners cleaned up in `useEffect` |

---

## 2. FSM State Transitions Audit: `src/game/entities/EnemyEntities.ts`

The enemy state machine revolves around the unified enum `EnemyState`:
```ts
export const EnemyState = {
  IDLE: 'IDLE',
  PATROL: 'PATROL',
  TRACKING: 'TRACKING',
  HUNTING: 'HUNTING',
  WINDUP: 'WINDUP',
  ATTACK: 'ATTACK',
  COOLDOWN: 'COOLDOWN',
  EVADING: 'EVADING',
  ENRAGED: 'ENRAGED',
  PHASING: 'PHASING',
  MATERIALIZED: 'MATERIALIZED',
  STUNNED: 'STUNNED',
} as const;
```

### 2.1. ChaserEnemy
- **State Flow:**
  - `TRACKING` (initial) ➔ LOS corridor detected (dist ≤ 4) ➔ `WINDUP` (350ms lock) ➔ `ATTACK` (charge at 240px/s) ➔ wall impact / timeout ➔ `COOLDOWN` (900ms stun) ➔ `TRACKING`.
  - Secondary path: Bomb planted ➔ `EVADING` (2500ms watchdog) ➔ Bomb exploded / timeout ➔ `TRACKING`.
- **`changeState(newState: EnemyState)` Audit:**
  - Performs direct property mutation (`this.aiState = newState`), updates `this.overheadUI.setIntent(...)`, and sets scalar velocity/timer values (`this.stateTimer = ...`).
  - **Closure Verification:** ZERO closures allocated in `changeState`.
- **`updateAI` Runtime Audit:**
  - State timers (`this.stateTimer -= delta`, `this.evadeTimeoutMs -= delta`, `this.bombCooldownTimer -= delta`) are decremented inline via arithmetic subtraction.
  - Zero closures in state transition conditions.
  - *Zero-GC Note:* Line 259/303 `cloneBombTilesAsSet()` and Line 260/304 string interpolation (`` `${er},${ec}` ``) allocate sets and strings on bomb-evaluation ticks. While not a closure, object pooling or flat grid lookup is recommended for hot-path bomb checks.

### 2.2. BomberEnemy
- **State Flow:**
  - `HUNTING` (initial) ➔ Bomb dropped (dist ≤ power or corner trap) ➔ `EVADING` (2500ms watchdog) ➔ Bomb exploded ➔ `HUNTING` (or `ENRAGED` if `hp === 1`).
  - Damage trigger: `takeDamage()` reduces HP to 1 ➔ `ENRAGED` (increased speed, quick fuse 1200ms).
- **`changeState(newState: EnemyState)` Audit:**
  - Updates overhead glyph (`💣`, `💨`, `😈`), adjusts scalar `this.moveSpeed`, and applies tint.
  - **Closure Verification:** ZERO closures allocated in `changeState`.
- **`updateAI` Runtime Audit:**
  - State recovery is driven purely by delta subtraction and scalar comparisons (`currentTime >= this.stunUntil`).
  - Zero closures.

### 2.3. TankEnemy (CRITICAL FINDING)
- **State Flow:**
  - Continuous bulldozer walk (`walkSpeed = 50`), bulldozing soft blocks upon proximity (< 28px).
  - Ground Stomp pulse triggered every 5000ms (`this.stompTimer <= 0`).
- **Defect Analysis — Line 874-880:**
  ```ts
  if (this.scene) {
    this.scene.time.delayedCall(1200, () => {
      if (this.active && !this.isDead) {
        this.overheadUI.setIntent('🛡️', true);
      }
    });
  }
  ```
  1. **Closure Leak on Stomp:** Every 5000ms per Tank enemy, a new anonymous arrow function closure is allocated and registered into Phaser's Clock timer manager.
  2. **Dangling Timer Reference:** The returned `Phaser.Time.TimerEvent` is not stored on the instance (`this.stompTimerEvent`). If the Tank dies or the scene shuts down during this 1200ms window, the timer closure remains queued in Phaser's clock, creating garbage collection churn.
  3. **Zero-GC Remediation:** Replace `this.scene.time.delayedCall` with a delta-driven scalar timer (`stompIntentTimer: number = 0`) updated in `updateAI`.

### 2.4. GhostEnemy
- **State Flow:**
  - Phasing mode (`alpha = 0.65`, passes blocks) ➔ Ether Dash trigger (dist ≤ 4, off cooldown) ➔ Dashing (`alpha = 1.0`, intent `⚡`, 450ms) ➔ Materialized cooldown (1500ms) ➔ Phasing mode.
- **Closure Verification:**
  - Controlled 100% via numerical scalar timestamps:
    - `this.dashRemainingMs -= delta`
    - `currentTime >= this.materializeUntil`
    - `this.dashCooldownTimer -= delta`
  - **Zero-GC Verdict:** 100% ZERO-GC compliant. No closures allocated during any phase of ghost combat or phasing.

### 2.5. SplitterEnemy & MiniSplitterEnemy
- **State Flow:**
  - SplitterEnemy tracks player at parent speed.
  - Upon fatal damage, `onDeath()` divides into 2 `MiniSplitterEnemy` instances placed at adjacent open tiles.
- **Closure Verification:**
  - `updateAI` and movement: ZERO closures allocated.
  - In `onDeath()` (Lines 1087-1091):
    ```ts
    const validTiles = candidates.filter((pt) => {
      if (pt.r < 1 || pt.r >= ROWS - 1 || pt.c < 1 || pt.c >= COLS - 1) return false;
      if (!map) return true;
      return map[pt.r]?.[pt.c] === TILE_EMPTY;
    });
    ```
    An arrow function `(pt) => ...` and filtered array are allocated on death. Since this occurs once upon entity destruction rather than in the continuous update loop, GC pressure is low, but using an in-place index loop would achieve strict Zero-GC.

---

## 3. FSM State Transitions Audit: `src/game/GameScene.ts`

`GameScene` orchestrates several macro-level state transitions:
1. Hit Stop Freeze (`triggerHitStop`)
2. Player Dash State (`isDashing`)
3. Bomb Placement & Fuse Countdown (`explodeBomb`)
4. Invulnerability & Shield Invariants (`shieldInvulnerableUntil`)
5. Boss Encounter Lifecycle (`startBossEncounter` / `dismissBoss`)
6. Crisis System Lifecycle (`startCrisisMode` / `stopCrisisMode`)

### 3.1. Hit Stop State Transition
- **Lines 555-575:**
  ```ts
  this.isHitStopActive = true;
  this.physics.world.pause();
  this.time.delayedCall(durationMs, () => {
    if (this.isHitStopActive) {
      this.physics.world.resume();
      this.isHitStopActive = false;
    }
  });
  ```
  - **Closure Allocation:** An anonymous closure `() => { ... }` is allocated on every hit-stop event (triggered on entity death, boss hits, crisis impacts).
  - **Remediation:** Track hit-stop duration using a scalar property `hitStopRemainingMs: number` inside `update(_time, delta)`. When active, skip entity update simulation and decrement `hitStopRemainingMs`. When it reaches 0, unpause physics without any closure allocation.

### 3.2. Dash State Transition
- **Line 3778:**
  ```ts
  this.time.delayedCall(DASH_DURATION_MS, () => {
    this.isDashing = false;
    ...
  });
  ```
  - **Closure Allocation:** Every player dash allocates a delayedCall timer closure.
  - **Remediation:** Replace with `this.dashRemainingMs -= delta` in the per-frame `update()` loop.

### 3.3. Bomb Arming & Fuse Countdown
- **Lines 2687, 2799, 2891:**
  ```ts
  const fuseTimer = this.time.delayedCall(fuseMs, () => {
    this.explodeBomb(bomb);
  });
  ```
  - Every bomb dropped allocates a `delayedCall` timer closure.
  - *Mitigation Note:* Bombs store `bomb.setData('fuseTimer', fuseTimer)` and `fuseTimer.remove()` is called in `explodeBomb` if detonated early by chain reactions. However, moving bomb fuses to a pooled ring buffer or delta update in `bombs.getChildren()` eliminates closure allocations entirely.

### 3.4. Invulnerability State Machine
- **Lines 1640-1650 in `update()`:**
  ```ts
  if (
    this.isInvulnerable &&
    !this.isDashing &&
    !this.isAegisOverdriveActive &&
    this.time.now >= this.shieldInvulnerableUntil
  ) {
    this.isInvulnerable = false;
    if (this.player && this.player.active) {
      this.player.alpha = 1;
    }
  }
  ```
  - **Zero-GC Verdict:** EXCELLENT. Uses clock timestamp arithmetic without closures or timers.

### 3.5. Boss & Crisis Subsystem FSMs
- `BaseBoss` (`src/game/bosses/BaseBoss.ts`) implements a 7-state FSM (`INTRO`, `PHASE_1`, `PHASE_2`, `PHASE_3`, `ENRAGED`, `STUNNED`, `DEFEATED`).
  - State transitions are executed via `this.transitionTo(newState)`:
    ```ts
    public transitionTo(newState: BossState): void {
      this.bossState = newState;
      this.stateTimerMs = 0;
      ...
    }
    ```
  - **Zero-GC Verdict:** 100% ZERO-GC compliant. All state changes and timers are purely numerical.
- `CrisisManager` (`src/game/crises/CrisisManager.ts`) implements a 5-stage FSM (`INACTIVE`, `WARNING`, `ACTIVE`, `RESOLVED`, `COOLDOWN`).
  - **Zero-GC Verdict:** 100% ZERO-GC compliant. Driven by scalar delta ticks.

---

## 4. Event Listeners Audit & Lifecycle Teardown

### 4.1. `src/game/entities/EnemyEntities.ts` Listeners Audit
- **Phaser Event Listeners (`this.events.on`, `this.game.events.on`):**
  - **Audit Result:** Exactly **0** event listeners are attached in `EnemyEntities.ts` or `BaseEntity.ts`.
- **DOM Event Listeners (`window.addEventListener`):**
  - **Audit Result:** Exactly **0** DOM event listeners are registered.
- **Teardown Inspection (`destroy()`):**
  - Inherits from `BaseEntity.destroy(fromScene?: boolean)`:
    ```ts
    public override destroy(fromScene?: boolean): void {
      if (this.dropShadow) {
        this.dropShadow.destroy();
        this.dropShadow = undefined;
      }
      if (this.overheadUI) {
        this.overheadUI.destroy();
      }
      super.destroy(fromScene);
    }
    ```
  - `OverheadUI.destroy()` cleans up `hpGraphics`, `nameTag`, and `indicator` text objects.
  - **Leak Identified:** As noted in Section 2.3, `TankEnemy`'s `delayedCall` timer for stomp intent reset is not cancelled in `destroy()`.

### 4.2. `src/game/GameScene.ts` Listeners Audit
- **Registered Listeners in `create()` (Lines 1594-1598):**
  ```ts
  this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  this.game.events.on('mode-changed', this.onModeChanged);
  this.game.events.on('perks-updated', this.onPerksUpdated);
  this.game.events.on('relics-updated', this.onRelicsUpdated);
  this.game.events.on('resume-run-state', this.onResumeRunState);
  ```
- **Teardown in `shutdown()` (Lines 813-843):**
  ```ts
  public shutdown(): void {
    if (this.game && this.game.events) {
      this.game.events.off('mode-changed', this.onModeChanged);
      this.game.events.off('perks-updated', this.onPerksUpdated);
      this.game.events.off('relics-updated', this.onRelicsUpdated);
      this.game.events.off('resume-run-state', this.onResumeRunState);
    }
    this.isHitStopActive = false;
    if (this.physics && this.physics.world && this.physics.world.isPaused) {
      this.physics.world.resume();
    }
    this.dismissBoss();
    this.stopCrisisMode();
    this.floatingTextManager?.reset();
    if (this.playerDropShadow) {
      this.playerDropShadow.destroy();
      this.playerDropShadow = undefined;
    }
    if (this.dustEmitter) {
      this.dustEmitter.destroy();
      this.dustEmitter = undefined;
    }
    if (this.bombSparkEmitter) {
      this.bombSparkEmitter.destroy();
      this.bombSparkEmitter = undefined;
    }
    if (this.blockDebrisEmitter) {
      this.blockDebrisEmitter.destroy();
      this.blockDebrisEmitter = undefined;
    }
  }
  ```
- **Analysis of `game.events.off` Cleanup:**
  - `this.onModeChanged`, `this.onPerksUpdated`, `this.onRelicsUpdated`, and `this.onResumeRunState` are declared as instance bound arrow properties (`private onModeChanged = (...) => { ... }`).
  - Therefore, passing `this.onModeChanged` to `this.game.events.off('mode-changed', this.onModeChanged)` passes the identical function reference.
  - **Verdict:** Cleanly and correctly unregistered!

- **Gaps & Vulnerabilities in `GameScene` Teardown:**
  1. **Omission of `Phaser.Scenes.Events.DESTROY` Hook:**
     - Only `SHUTDOWN` is hooked (`this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this)`).
     - If the game instance or scene is destroyed directly without transitioning through a standard shutdown event, `shutdown()` will not fire, leaving listeners on `this.game.events`.
     - *Fix:* Register `this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);`.
  2. **Keyboard Keys Not Removed:**
     - In `create()`, 10 keys are allocated via `this.input.keyboard.addKey(...)`.
     - In `shutdown()`, keys are not cleared. If the scene restarts, stale key listeners or references remain in Phaser's KeyboardPlugin.
     - *Fix:* Add `this.input.keyboard?.removeAllKeys();` in `shutdown()`.
  3. **Item Destroy Event Closure:**
     - Line 3893:
       ```ts
       item.once(Phaser.GameObjects.Events.DESTROY, () => {
         if (itemShadow && itemShadow.active) {
           itemShadow.destroy();
         }
       });
       ```
       - Allocates a closure for every item spawned.
       - *Fix:* Manage item shadows through an item pool or destroy them in a unified `collectItem` / `clearItems` routine.
  4. **Subsystem Graphics Teardown:**
     - `this.telegraphGraphics`, `this.bossGraphics`, and `this.crisisGraphics` are allocated in `create()`. While `dismissBoss()` clears them, explicit `.destroy()` in `shutdown()` ensures GPU memory release.

### 4.3. DOM Event Listeners Audit (`src/components/BombermanGame.tsx`)
- DOM Event Listeners verified:
  - `window.addEventListener('resize', checkMobile)` ➔ Removed via `window.removeEventListener('resize', checkMobile)`
  - `window.addEventListener('keydown', handleKeyDown)` ➔ Removed via `window.removeEventListener('keydown', handleKeyDown)`
  - `window.addEventListener('keyup', handleKeyUp)` ➔ Removed via `window.removeEventListener('keyup', handleKeyUp)`
  - `window.addEventListener('pagehide', handlePageHide)` ➔ Removed via `window.removeEventListener('pagehide', handlePageHide)`
  - `window.addEventListener('beforeunload', handlePageHide)` ➔ Removed via `window.removeEventListener('beforeunload', handlePageHide)`
- Phaser Game Event Listeners on React side:
  - `phaserGame.events.off('stats-update', handleStatsUpdate)`
  - `phaserGame.events.off('boss-hud-update', handleBossHudUpdate)`
  - `phaserGame.events.off('situation-log-update', handleSituationLogUpdate)`
  - `phaserGame.events.off('currency-reward')`
- **Verdict:** DOM and React-Phaser bridge listener unregistration is 100% airtight and compliant.

---

## 5. Zero-GC Remediation Blueprint

### 5.1. TankEnemy Stomp Intent Timer (Zero-GC)
**Problem:** `this.scene.time.delayedCall(1200, () => { ... })` allocates closures on every stomp pulse.  
**Solution:** Replace with scalar timer:
```ts
// In TankEnemy class:
private stompIntentTimer: number = 0;

// In updateAI(delta, currentTime, ...):
if (this.stompIntentTimer > 0) {
  this.stompIntentTimer -= delta;
  if (this.stompIntentTimer <= 0) {
    this.stompIntentTimer = 0;
    this.overheadUI.setIntent('🛡️', true);
  }
}

// In stomp execution block:
if (this.stompTimer <= 0) {
  this.stompTimer = 5000;
  this.stompIntentTimer = 1200; // Reset intent back to shield after 1200ms
  this.overheadUI.setIntent('💥', true);
  // ... apply stomp slow ...
}
```

### 5.2. GameScene Complete Teardown Guard
**Problem:** Scene destroy bypasses shutdown; keyboard keys persist across scene recycles.  
**Solution:** Update `create()` and `shutdown()` in `GameScene.ts`:
```ts
// In create():
this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);

// In shutdown():
public shutdown(): void {
  // 1. Deregister global event bus
  if (this.game && this.game.events) {
    this.game.events.off('mode-changed', this.onModeChanged);
    this.game.events.off('perks-updated', this.onPerksUpdated);
    this.game.events.off('relics-updated', this.onRelicsUpdated);
    this.game.events.off('resume-run-state', this.onResumeRunState);
  }

  // 2. Clear input keyboard keys
  if (this.input && this.input.keyboard) {
    this.input.keyboard.removeAllKeys();
  }

  // 3. Destroy subsystem graphics
  this.telegraphGraphics?.destroy();
  this.bossGraphics?.destroy();
  this.crisisGraphics?.destroy();

  // 4. Existing emitters & boss dismissal
  ...
}
```

### 5.3. HitStop Zero-GC Transition
**Problem:** `triggerHitStop` allocates delayedCall closures.  
**Solution:**
```ts
// Property on GameScene:
private hitStopRemainingMs: number = 0;

public triggerHitStop(durationMs: number = 45): void {
  if (this.hitStopRemainingMs > 0) return;
  this.isHitStopActive = true;
  this.hitStopRemainingMs = durationMs;
  if (this.physics && this.physics.world) {
    this.physics.world.pause();
  }
}

// In update(_time, delta):
if (this.hitStopRemainingMs > 0) {
  this.hitStopRemainingMs -= delta;
  if (this.hitStopRemainingMs <= 0) {
    this.hitStopRemainingMs = 0;
    this.isHitStopActive = false;
    if (this.physics && this.physics.world && this.physics.world.isPaused) {
      this.physics.world.resume();
    }
  }
  return; // Freeze game frame during hit-stop
}
```

---

## 6. Conclusion & Verification

1. **State Machine Integrity:** The FSM implementations in `EnemyEntities.ts` (`ChaserEnemy`, `BomberEnemy`, `GhostEnemy`) and subsystems (`BaseBoss`, `CrisisManager`) are fundamentally well-architected for Zero-GC, using numeric enums and scalar delta accumulation. The lone defect is `TankEnemy`'s `time.delayedCall(1200, () => ...)`.
2. **Event Listener Teardown:** `GameScene` correctly leverages bound class properties for its `game.events` bridge, ensuring reference matching during `off()`. Hooking `DESTROY` alongside `SHUTDOWN` and clearing keyboard keys will make the scene teardown impervious to memory leaks.
3. **DOM Cleanliness:** React-Phaser integration in `BombermanGame.tsx` is completely balanced with matching `removeEventListener` and `events.off` calls.
