# Total Inspection Findings: Architecture, Bosses & Crises

**Target**: Bomberman Game Codebase  
**Inspection Date**: 2026-09-18  
**Inspector**: Architecture, Bosses & Crises Inspector (`explorer_inspect_arch`)  
**Scope**: Boss Transitions, Telegraph Engine, Crisis Lifecycle, Game Mode Resets, Scaling Engine  

---

## Executive Summary

A comprehensive architectural inspection was conducted across the Bomberman game subsystem implementations, focusing on the newly introduced epic bosses, 3-tier floor telegraph engine, 6 dynamic map crises, roguelite game modes, and infinite scaling engine. 

While the standalone simulation classes (`BaseBoss`, `GummyBearBoss`, `HamsterBoss`, `QueenBeeBoss`, `TelegraphEngine`, `CrisisManager`, `GameModeManager`, `ScalingEngine`) exhibit clean object-oriented architectures and pass their dedicated unit tests, **critical architectural disconnects, memory corruption bugs, invulnerability deadlocks, and lifecycle leaks** were uncovered when inspecting their integration with the Phaser runtime (`GameScene.ts`) and React UI (`BombermanGame.tsx`).

### Critical Severity Matrix
| Finding ID | Domain | Severity | Description |
|---|---|---|---|
| **FINDING-01** | Boss Subsystem | **CRITICAL** | Captain Nibbles and Queen Bee Cupcake are permanently invincible in `GameScene` due to missing collision/dive/stunning triggers. |
| **FINDING-02** | Boss Subsystem | **HIGH** | Post-combo invulnerability (1500ms i-frames) overlaps and cancels tactical stun vulnerability windows across all bosses. |
| **FINDING-03** | Boss Subsystem | **MEDIUM** | Instant dismissal on boss defeat aborts death animations, particle VFX, and currency feedback in a single frame. |
| **FINDING-04** | Boss Subsystem | **MEDIUM** | Minion spawning logic in `GummyBearBoss` only increments an abstract counter without creating entities; `BossAttackManager.minionPool` is completely unused and orphaned. |
| **FINDING-05** | Telegraph Engine | **CRITICAL** | Swap-and-pop memory corruption in `TelegraphEngine.cancelAttack()` and `update()` causes slot index desynchronization and data overwrites. |
| **FINDING-06** | Telegraph Engine | **HIGH** | `TelegraphEngine` is instantiated in `GameScene` but no boss attacks ever register danger tiles during gameplay; danger tiles can be placed on outer perimeter walls. |
| **FINDING-07** | Crisis Subsystem | **CRITICAL** | `CrisisManager` and `SituationLog` are completely disconnected from `GameScene` and `BombermanGame.tsx`; 0 crises or hazards are ever active during gameplay. |
| **FINDING-08** | Crisis Subsystem | **HIGH** | `BaseCrisis.reset()` fails to reset subclass-specific state (pending craters, void creep counts, dynamo window timers, vents, caldera state). |
| **FINDING-09** | Mode Resets | **HIGH** | Game mode changes and `this.scene.restart()` cause duplicate event listeners on `this.game.events`, do not clear active bosses, and lack progression resets. |
| **FINDING-10** | Scaling Engine | **MEDIUM** | Enemy and boss HP scale infinitely without soft caps (yielding 25+ HP minions and 158+ HP bosses by wave 100); `NaN` inputs produce `NaN` across all scaling formulas. |

---

## Detailed Findings by Domain

### 1. Boss Transitions & State Machines

#### Finding 1.1: Runtime Invincibility Deadlock for Captain Nibbles and Queen Bee Cupcake
- **Files**: `src/game/bosses/HamsterBoss.ts` (lines 39-43), `src/game/bosses/QueenBeeBoss.ts` (lines 59-65), `src/game/GameScene.ts` (lines 2498-2510).
- **Observation**:
  - In `HamsterBoss.ts`:
    ```typescript
    public override canTakeDamage(): boolean {
      // Frontal shield protects during normal dash unless stunned or hitting a bomb head-on
      return this.bossState === BossState.STUNNED;
    }
    ```
    Stun can only be initiated by `onHeadOnBombCollision()` (line 126). However, in `GameScene.ts`, there is **zero collision logic** between dashing `HamsterBoss` and active bombs, and **zero boundary collision logic** (`onWallImpact()` is never called).
  - In `QueenBeeBoss.ts`:
    ```typescript
    public override canTakeDamage(): boolean {
      return this.isGrounded && this.bossState === BossState.STUNNED;
    }
    ```
    Grounding requires `popShield()`, `snipeFromSky()`, or `onDiveImpact()`. Neither `GameScene.ts` nor `QueenBeeBoss.update()` ever initiates a dive (`initiateRoyalDive()`) or shield pop.
- **Impact**: Both Captain Nibbles and Queen Bee Cupcake are 100% invincible in `GameScene.ts`. Player bombs deal 0 damage, making both boss encounters impossible to win in actual gameplay.
- **Remediation**:
  1. In `GameScene.ts`, add Arcade physics overlap between `this.activeBoss` (when instance of `HamsterBoss`) and `this.bombs` to trigger `boss.onHeadOnBombCollision()`.
  2. Implement an automated flight attack cycle in `QueenBeeBoss.update()` that periodically initiates `initiateRoyalDive()`, grounding the boss upon crater impact and exposing a 2.5s stun vulnerability window.

---

#### Finding 1.2: Post-Combo Invulnerability Overriding Tactical Stun Windows
- **Files**: `src/game/bosses/BaseBoss.ts` (lines 203-252), `src/game/bosses/GummyBearBoss.ts` (lines 141-157).
- **Observation**:
  - In `BaseBoss.ts`:
    ```typescript
    // Inside resolveComboBuffer():
    if (this.comboHits >= 2) {
      const bonusStun = Math.min(1.5, (this.comboHits - 1) * 0.75);
      const totalStunSec = 3.0 + bonusStun;
      this.applyStun(totalStunSec);
    }
    // Engage post-combo i-frames
    this.iFrameTimerMs = this.defaultIFrameMs; // 1500ms
    this.isInvulnerable = true;
    ```
  - When a boss enters the `STUNNED` state (either via a 2+ bomb combo, Gummy Bear landing lure, or Hamster head-on bomb collision), `resolveComboBuffer()` immediately engages 1500ms of invulnerability (`isInvulnerable = true`).
  - While `this.isInvulnerable && this.comboBufferTimerMs <= 0`, `takeBombDamage()` rejects all damage.
- **Impact**: During the first 1.5 seconds of a 3.0s or 2.2s tactical stun window, player bombs deal 0 damage. The player is visually informed the boss is stunned (stars rotating overhead), but bombs detonated on the boss fail.
- **Remediation**: In `BaseBoss.resolveComboBuffer()`, do not apply post-combo i-frames if the boss is entering or currently in `BossState.STUNNED`. Only apply i-frames when transitioning out of stun back into an active combat phase.

---

#### Finding 1.3: Death Animation Race Condition & Instant Nullification
- **Files**: `src/game/GameScene.ts` (lines 1981-1986).
- **Observation**:
  ```typescript
  // Defeat check in GameScene.update():
  if (this.activeBoss.currentHp <= 0 || this.activeBoss.getState() === BossState.DEFEATED) {
    this.score += 5000;
    this.game.events.emit('currency-reward', { starCandies: 50, cosmicEssence: 25 });
    this.dismissBoss();
  }
  ```
  `dismissBoss()` immediately sets `this.activeBoss = null` and clears `this.bossGraphics`.
- **Impact**: There is zero delay, defeat tween, or death animation. The boss sprite/graphic vanishes abruptly in a single frame. Any lingering projectiles or shockwaves are not cleaned up.
- **Remediation**: Introduce a 1200ms `BossState.DEFEATED` animation sequence (flashing white, particle burst, slow dissolve) before calling `this.dismissBoss()`.

---

#### Finding 1.4: Minion Spawning & Despawn Disconnect
- **Files**: `src/game/bosses/GummyBearBoss.ts` (lines 168-175), `src/game/bosses/BossAttackManager.ts` (lines 75-97).
- **Observation**:
  - `GummyBearBoss.spawnMinionCubs(2)` only increments `this.activeCubCount += toSpawn`. No actual minion objects or sprites are spawned.
  - `BossAttackManager` maintains a dedicated `minionPool: ObjectPool<BossMinion>`, but `acquire()` is never called in `BossAttackManager.ts` or `GameScene.ts`.
  - When the boss is defeated, `activeCubCount` is not reset in `onDefeated()`, nor is there a call to despawn existing minions.
- **Impact**: The minion feature is purely cosmetic/headless and non-functional in the gameplay loop.

---

### 2. Telegraph Engine

#### Finding 2.1: Swap-and-Pop Data Corruption in `cancelAttack()` and `update()`
- **Files**: `src/game/bosses/TelegraphEngine.ts` (lines 414-447, lines 463-510).
- **Observation**:
  In `cancelAttack()`:
  ```typescript
  const slot = this.activeSlots[i];
  ...
  const lastSlotIdx = --this._activeCount;
  if (i < lastSlotIdx) {
    const movedSlot = this.activeSlots[lastSlotIdx];
    this.activeSlots[i] = movedSlot;

    this.slotTileIndex[slot] = this.slotTileIndex[movedSlot];
    this.slotAttackId[slot] = this.slotAttackId[movedSlot];
    this.slotRemainingTimeMs[slot] = this.slotRemainingTimeMs[movedSlot];
    this.slotTotalDurationMs[slot] = this.slotTotalDurationMs[movedSlot];
    this.slotStage[slot] = this.slotStage[movedSlot];
    this.slotFlags[slot] = this.slotFlags[movedSlot];
  }
  ```
  And identically in `update()`:
  - `this.activeSlots[i]` is replaced with `movedSlot`.
  - BUT the fields from `movedSlot` are copied into `slot` (the index of the slot being popped)!
  - In the subsequent loop iteration or frame, `this.activeSlots[i]` yields `movedSlot`. When indexing the parallel typed arrays using `slot`, the engine reads from index `movedSlot` (which was never updated) rather than `slot` (where the moved data was stored)!
  - When a new attack tile is allocated at `lastSlotIdx`, it overwrites the slot at `movedSlot`, corrupting the active telegraph.
- **Impact**: Any cancellation or expiration of a telegraph when multiple telegraphs are active causes data desynchronization, phantom timers, and early or omitted hazard activations.
- **Remediation**: Use direct flat indexing on the parallel typed arrays without the redundant `activeSlots` indirection array:
  ```typescript
  if (i < lastSlotIdx) {
    this.slotTileIndex[i] = this.slotTileIndex[lastSlotIdx];
    this.slotAttackId[i] = this.slotAttackId[lastSlotIdx];
    this.slotRemainingTimeMs[i] = this.slotRemainingTimeMs[lastSlotIdx];
    this.slotTotalDurationMs[i] = this.slotTotalDurationMs[lastSlotIdx];
    this.slotStage[i] = this.slotStage[lastSlotIdx];
    this.slotFlags[i] = this.slotFlags[lastSlotIdx];
  }
  ```

---

#### Finding 2.2: Outer Perimeter Wall Telegraphing & Missing Connectivity Enforcement
- **Files**: `src/game/bosses/TelegraphEngine.ts` (lines 305-370).
- **Observation**:
  - `registerAttack()` checks `idx >= 0 && idx < this.totalTiles`, but does not verify `this.walkableMask[idx] === 1`. Outer border wall tiles (row 0, row 12, col 0, col 14) are marked active and rendered with flashing danger overlays over border walls.
  - `validateConnectedEscape()` exists (lines 239-299) to ensure that the safe area maintains a connected component of size >= 2, but it is **never called inside `registerAttack()`**.
- **Impact**: Boss attacks can register on outer walls and can legally partition the arena into inescapable 1-tile traps even while staying below the 60% danger limit.
- **Remediation**:
  1. Filter out `this.walkableMask[idx] === 0` in `registerAttack()`.
  2. Invoke `this.validateConnectedEscape(targetTiles)` before committing slots.

---

### 3. Crisis Lifecycle & Hazards

#### Finding 3.1: Complete Omission of `CrisisManager` and `SituationLog` in Runtime
- **Files**: `src/game/GameScene.ts`, `src/components/BombermanGame.tsx`.
- **Observation**:
  - Grep searches for `CrisisManager` and `SituationLog` across `GameScene.ts` and `BombermanGame.tsx` yield **0 references**.
  - `GameScene` has no `crisisManager` property, no crisis update tick, and no hazard tile rendering pipeline.
- **Impact**: Despite all 6 crises having comprehensive simulation classes and passing headless unit tests, dynamic Stellaris-style crises do not exist in the playable web game.
- **Remediation**:
  1. Instantiate `this.crisisManager = new CrisisManager()` in `GameScene.ts`.
  2. In `GameScene.update()`, call `this.crisisManager.update(delta, { r, c })` and render active hazard tiles (void creep, lava, vents, conveyor belts) onto a dedicated Phaser graphics layer.
  3. Wire `SituationLog` events to the React UI in `BombermanGame.tsx`.

---

#### Finding 3.2: Incomplete State Teardown in `BaseCrisis.reset()`
- **Files**: `src/game/crises/BaseCrisis.ts` (lines 353-365), `src/game/crises/OrbitalCrisis.ts` (lines 127-136), `src/game/crises/VoidCrisis.ts`.
- **Observation**:
  - `BaseCrisis.reset()` clears `hazardTileBuffer` and `activeHazardList`, but subclasses do not override `reset()`.
  - In `OrbitalCrisis`, `this.pendingCraters` (array of timers waiting to spawn kinetic craters) is not cleared by `reset()`.
  - In `VoidCrisis`, `this.prisms`, `this.voidCreepCount`, `this.avatarSpawned`, and `this.supernovaCleansed` are not reset.
  - In `ClockworkCrisis`, `this.conduits`, `this.isOverloadWindowActive`, and `this.overloadWindowTimerMs` are not reset.
- **Impact**: If a crisis is cancelled via `stopCrisis('failed')` or `reset()`, residual timers and state flags persist into future crisis triggers.
- **Remediation**: Call `this.onInit()` or provide an abstract `onReset()` hook in `BaseCrisis.reset()` that all 6 subclasses implement to clear custom collections and timers.

---

### 4. Game Mode Resets & Progression

#### Finding 4.1: Game Mode Changes & Duplicate Listener Leaks on Scene Restart
- **Files**: `src/game/GameScene.ts` (lines 1546-1553, lines 2639-2645).
- **Observation**:
  ```typescript
  // Inside GameScene.create():
  this.game.events.on('mode-changed', (mode: string) => {
    if (mode === 'boss_rush' || mode === 'BOSS_RUSH') {
      this.startBossEncounter('king_gummy_bear');
    } else if (this.activeBoss) {
      this.dismissBoss();
    }
  });
  ```
  - `this.game.events` is the global game event emitter. Each time `this.scene.restart()` is called (e.g. on player death), `create()` runs again and registers an additional `'mode-changed'` listener.
  - After 5 deaths, selecting Boss Rush triggers `startBossEncounter` 6 times in parallel.
  - In `create()`, `this.activeBoss` is not reset to `null`. If a restart occurs while a boss is active, the old boss instance persists while `bossGraphics` and `telegraphEngine` are re-created as new instances.
- **Impact**: Severe event listener leak, desynchronized boss instances, and memory leaks across scene restarts.
- **Remediation**: Clean up event listeners in a `shutdown` listener (`this.events.once(Phaser.Scenes.Events.SHUTDOWN, ...)`), and explicitly call `this.dismissBoss()` at the top of `create()`.

---

#### Finding 4.2: GameModeManager Disconnected from Runtime Loop
- **Files**: `src/game/progression/GameModes.ts`, `src/game/GameScene.ts`.
- **Observation**:
  - `GameModeManager` contains rich logic for 60s crisis cadences, 45s drop pods, 20s Madame Bonbon rest stops in Boss Rush, and 3-card Boon Drafts in Endless Gauntlet.
  - However, `GameModeManager` is never instantiated or updated in `GameScene.ts`.
- **Impact**: Switching modes in the React UI only sets a state variable and emits an event that `GameScene` mostly ignores. Boss Rush stops after King Gummy Bear; Crisis Survival spawns no drop pods; Endless Gauntlet generates no chamber transitions or boon drafts.

---

### 5. Scaling Engine & Numerical Robustness

#### Finding 5.1: Missing Soft Caps on Enemy and Boss Health
- **Files**: `src/game/progression/ScalingEngine.ts` (lines 118-121, lines 181-184).
- **Observation**:
  - Enemy HP formula: `HP(W) = floor(HP0 + 0.25 * (W - 1))`.
  - Boss HP formula: `BossHP(W) = floor(BaseBossHP * (1.0 + 0.15 * (W - 1)))`.
  - Unlike velocity (soft-capped at 2.2x) and enemy density (hard-capped at 14), HP scales linearly without any ceiling.
  - At wave 100, basic enemies require 25 bomb hits. At wave 100, King Gummy Bear requires 158 hits.
- **Impact**: High-wave Endless Gauntlet runs become tedious slogs where standard enemies require dozens of bomb explosions.
- **Remediation**: Apply a soft cap to enemy HP (e.g. `Math.min(6, ...)` for standard enemies) and boss HP (e.g. `Math.min(baseBossHp * 2.5, ...)`).

---

#### Finding 5.2: `NaN` Propagation in Scaling Functions
- **Files**: `src/game/progression/ScalingEngine.ts` (lines 100-185).
- **Observation**:
  - All scaling methods use `const safeWave = Math.max(1, Math.floor(wave))`.
  - In JavaScript, `Math.max(1, NaN)` evaluates to `NaN`.
  - Any `NaN` wave input results in `NaN` velocities, `NaN` health, and `NaN` fuses.
- **Impact**: Any uninitialized or corrupted wave state will poison physics calculations and lock enemy updates.
- **Remediation**: Guard inputs with `const safeWave = Number.isFinite(wave) ? Math.max(1, Math.floor(wave)) : 1;`.

---

## Verification & Independent Confirmation Steps

1. **Verify Boss Invincibility**:
   Inspect `src/game/bosses/HamsterBoss.ts:39-43` and `src/game/bosses/QueenBeeBoss.ts:59-65`. Verify that neither `HamsterBoss.onHeadOnBombCollision()` nor `QueenBeeBoss.groundBoss()` is ever called in `src/game/GameScene.ts`.
2. **Verify Telegraph Swap-and-Pop Bug**:
   Inspect `src/game/bosses/TelegraphEngine.ts:432-441` and `src/game/bosses/TelegraphEngine.ts:490-500`. Observe that `activeSlots[i]` is assigned `movedSlot`, but slot properties are written to `slotTileIndex[slot]`.
3. **Verify Crisis Integration Absence**:
   Run ripgrep for `CrisisManager` in `src/game/GameScene.ts`. Verify 0 occurrences.
4. **Verify Event Listener Leak**:
   Inspect `src/game/GameScene.ts:1547-1553`. Note that `this.game.events.on('mode-changed', ...)` is attached in `create()` without cleanup on scene restart.
5. **Verify Scaling Formulations**:
   Inspect `src/game/progression/ScalingEngine.ts:118-121` and `src/game/progression/ScalingEngine.ts:181-184`. Confirm lack of upper bound clamping on HP.
