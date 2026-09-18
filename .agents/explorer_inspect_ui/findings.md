# Comprehensive Inspection Report: UI, Controls & State Synchronization
**Milestone**: Total Inspection ("총검사") — Phase 1  
**Inspector**: Teamwork Explorer (UI, Controls & State Sync Inspector)  
**Date**: 2026-09-18  
**Scope**: React <-> Phaser bridge, mobile touch controls, arcade HUD synchronization, overhead entity UI, inventory drawer, modals & accessibility.

---

## Executive Summary

A forensic, read-only inspection of the Bomberman codebase (`src/components/BombermanGame.tsx`, `src/game/GameScene.ts`, `src/game/bosses/`, `src/game/crises/`, `src/game/entities/`, and related test suites) revealed **critical synchronization breakdowns, input race conditions, and dead zones** across all four target inspection areas:

1. **React <-> Phaser Bridge**:
   - Cooldown and buff timers (`dashCooldownRemaining`, `ultimateLockoutRemaining`, `activeBuffs[].remainingMs`) are decremented every frame in `GameScene.ts:update()`, but `emitStatsUpdate()` is **never called while ticking down**. As a result, the React HUD displays **frozen, static countdown strings** (e.g. `3.5s`, `6.0s`, `8.0s`) until reaching 0, when they abruptly snap to READY or disappear.
   - `this.bossHUD.update(delta)` is **completely missing** from `GameScene.ts:update()`. Consequently, boss stun countdowns (`stunRemainingMs`), combo windows, and active threat alerts never tick down in `BossHUD`, leaving bosses permanently marked as `💫 STUNNED` in the React Boss HUD overlay.
   - `SituationLog` and `CrisisManager` are fully implemented and unit-tested in isolation, but are **never instantiated in `GameScene.ts`**, and `BombermanGame.tsx` has zero listeners for `situation-log-update` / `crisis-situation-log-update`.
   - `BombermanGame.tsx` emits `'perks-updated'`, `'relics-updated'`, and `'resume-run-state'`, but `GameScene.ts` registers **zero listeners** for any of them. Upgraded perks and equipped relics have no effect on in-game gameplay, and resuming a run leaves Phaser in an un-restored state while React updates stats.
   - Scene restarts (`this.scene.restart()`) fail to unregister `this.game.events.on('mode-changed')`, leaking duplicate event listeners on every player death.

2. **Mobile Touch Controls**:
   - **NippleJS Angle Partitioning Dead Zones**: At exactly 135.0° and 225.0°, all four directional conditions in `BombermanGame.tsx` evaluate to `false`, causing the player to freeze mid-motion.
   - **Action Button Race Conditions**: Mobile buttons (`BOMB`, `DASH`, `ULT`) use `onPointerDown` with `setTimeout` (100ms/150ms) to reset `mobileInput` flags. Rapid tapping creates overlapping timer races where an earlier timer clears a subsequent tap before Phaser consumes it.
   - **Missing Touch Cancel & Pointer Capture**: No buttons implement `onPointerCancel` or `onPointerLeave`. The Ultimate button pairs `onPointerDown` with `onPointerUp` without `setPointerCapture`, causing the button to stick or drop release events if the finger slides outside its bounding circle.
   - **Touch Delay on Mobile Inventory**: Mobile Inventory button uses `onClick` instead of `onPointerDown`, causing touch latency and dropped taps under `touch-none`.

3. **HUD Synchronization**:
   - Active skill cooldowns, ultimate lockouts, and tactical buffs lack real-time throttle emission, creating UI desync between actual game physics and React display.
   - Currency rewards (`currency-reward`) received in React update component state but are never written to `GameStatePersistence` (`syncMetaProfile` is never called), risking currency loss on browser refresh.

4. **Inventory Drawer, Modals & Accessibility**:
   - **Keyboard Trap in Modals**: Global `handleKeyDown` in `BombermanGame.tsx` executes `e.preventDefault()` on `Space`, `Shift`, `E`, `R`, `Q` even when modals are open. When importing a save JSON in the Backup modal, typing spaces or letters `e`, `r`, `q` is blocked while simultaneously triggering bombs, dashes, and ultimates in the background game.
   - **No Escape Key Dismissal**: None of the modals or the Inventory drawer listen for the `Escape` key.
   - **Desktop Tooltip Clipping**: Arsenal tooltips use fixed `w-64` and `left-1/2 -translate-x-1/2`. Badges near container borders overflow off-screen and are clipped by parent `overflow-hidden`.
   - **Unanimated Drawer**: Inventory drawer abruptly mounts/unmounts without slide or fade transitions.

---

## Detailed Findings by Inspection Area

### 1. React <-> Phaser Bridge

#### 1.1 Cooldown & Buff Countdown Freeze in React HUD
- **Location**: `src/game/GameScene.ts:1599-1606`, `1635-1641`, `1648-1663`
- **Observation**:
  ```typescript
  // GameScene.ts:1635-1641 (Dash cooldown)
  if (this.dashCooldownRemaining > 0) {
    const prevCd = this.dashCooldownRemaining;
    this.dashCooldownRemaining = Math.max(0, this.dashCooldownRemaining - delta * cdMult);
    if (prevCd > 0 && this.dashCooldownRemaining === 0) {
      this.emitStatsUpdate();
    }
  }

  // GameScene.ts:1599-1606 (Ultimate lockout)
  if (this.ultimateLockoutRemaining > 0) {
    const prev = this.ultimateLockoutRemaining;
    this.ultimateLockoutRemaining = Math.max(0, this.ultimateLockoutRemaining - delta);
    if (prev > 0 && this.ultimateLockoutRemaining <= 0) {
      this.isUltimateReady = this.ultimateGauge >= this.ultimateMax;
      this.emitStatsUpdate();
    }
  }

  // GameScene.ts:1648-1663 (Active buffs)
  if (this.activeBuffs && this.activeBuffs.length > 0) {
    let buffChanged = false;
    this.activeBuffs.forEach((b) => {
      b.remainingMs = Math.max(0, b.remainingMs - delta);
      if (b.remainingMs <= 0) buffChanged = true;
    });
    if (buffChanged) {
      this.activeBuffs = this.activeBuffs.filter((b) => b.remainingMs > 0);
      ...
      this.emitStatsUpdate();
    }
  }
  ```
- **Logic Chain**:
  1. In `BombermanGame.tsx:835`, Dash displays `(stats.dashCooldownRemaining / 1000).toFixed(1) + 's'`.
  2. When the player dashes, `performDash()` sets `dashCooldownRemaining = 3500` and emits `stats-update` once.
  3. During the 3.5 seconds of cooldown, `GameScene.ts:update()` decrements `this.dashCooldownRemaining` by `delta` each frame.
  4. However, `this.emitStatsUpdate()` is ONLY called when `this.dashCooldownRemaining === 0`.
  5. Therefore, React never receives intermediate countdown values. The Dash badge stays frozen displaying `3.5s` for 3.5 seconds, and then snaps directly to `READY`.
  6. The exact same defect occurs for Ultimate lockout (`6.0s` frozen for 6 seconds) and active buffs (`SPEED_SURGE` displays `8.0s` frozen for 8 seconds, then abruptly vanishes).
- **Severity**: HIGH (Visual desync, poor player feedback)
- **Remediation**:
  Implement a throttled countdown emitter in `GameScene.ts:update()` (e.g. every 50ms–100ms or when an active timer exists), similar to `BossHUD`'s `emitIntervalMs = 50`.

---

#### 1.2 BossHUD.update() Missing from Game Loop & Infinite Stun State
- **Location**: `src/game/GameScene.ts:1930-1944`, `src/game/bosses/BossHUD.ts:143-209`
- **Observation**:
  `GameScene.ts:1930-1944`:
  ```typescript
  if (this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED) {
    this.activeBoss.update(delta, this.player.x, this.player.y);

    if (this.telegraphEngine) {
      this.telegraphEngine.update(delta);
      this.telegraphEngine.render(_time);
    }

    if (this.bossHUD) {
      this.bossHUD.setHp(this.activeBoss.currentHp);
      this.bossHUD.setBossState(this.activeBoss.bossState);
      this.bossHUD.setEnrageGauge(this.activeBoss.enrageGauge);
    }
    // NOTICE: this.bossHUD.update(delta) is NEVER called!
  ```
- **Logic Chain**:
  1. `BossHUD.triggerStun(durationSec, reason)` is called at `GameScene.ts:2506` when a boss is stunned, setting `this.state.isStunned = true` and `this.state.stunRemainingMs = durationSec * 1000`.
  2. Ticking down `stunRemainingMs`, combo window decay, and alert timeout are implemented inside `BossHUD.update(deltaMs)` (`BossHUD.ts:149-156`).
  3. Because `this.bossHUD.update(delta)` is never called in `GameScene.ts`, `stunRemainingMs` never decrements and `isStunned` is never reset to `false`.
  4. Furthermore, `BossHUD.setBossState()` does not reset `isStunned`.
  5. In React (`BombermanGame.tsx:1015-1019`), the Boss HUD displays `💫 STUNNED 2.2s` indefinitely for the remainder of the boss fight.
- **Severity**: HIGH (Permanent UI state glitch)
- **Remediation**:
  Add `this.bossHUD.update(delta);` inside `GameScene.ts:update()` immediately after `this.activeBoss.update(delta, ...)`.

---

#### 1.3 Disconnected Situation Log & Crisis Subsystem
- **Location**: `src/game/GameScene.ts`, `src/game/crises/SituationLog.ts:72-78`, `src/components/BombermanGame.tsx`
- **Observation**:
  - Grep for `SituationLog` and `CrisisManager` in `GameScene.ts` returns **0 matches**.
  - Grep for `situation-log-update` and `crisis-situation-log-update` in `BombermanGame.tsx` returns **0 matches**.
  - `GameScene.ts:1547-1553` only handles `mode === 'boss_rush'`:
    ```typescript
    this.game.events.on('mode-changed', (mode: string) => {
      if (mode === 'boss_rush' || mode === 'BOSS_RUSH') {
        this.startBossEncounter('king_gummy_bear');
      } else if (this.activeBoss) {
        this.dismissBoss();
      }
    });
    ```
- **Logic Chain**:
  1. The Stellaris-style crisis engine was architected and unit-tested in `src/game/crises/` (`CrisisManager`, `SituationLog`, 6 crisis classes).
  2. However, it was never connected to the runtime `GameScene.ts`.
  3. Selecting `GameModeType.CRISIS_SURVIVAL` in `BombermanGame.tsx` emits `'mode-changed'`, but `GameScene` takes no action for this mode.
  4. No situation log UI exists in `BombermanGame.tsx` to display crisis objectives, threat trends, or hazard alerts.
- **Severity**: MEDIUM-HIGH (Feature disconnect between backend simulation and frontend HUD)
- **Remediation**:
  Instantiate `CrisisManager` and `SituationLog` in `GameScene.ts`. Listen for `mode-changed` with `'crisis_survival'` to activate crises, and wire `situation-log-update` into `BombermanGame.tsx` to render a crisis tracker banner.

---

#### 1.4 Unhandled React -> Phaser Events: Perks, Relics, and Saved Runs
- **Location**: `src/components/BombermanGame.tsx:128`, `142`, `154`, `162`, `214`; `src/game/GameScene.ts`
- **Observation**:
  `BombermanGame.tsx` emits:
  - `phaserGameRef.current.events.emit('perks-updated', res.newPerks);` (lines 128, 142)
  - `phaserGameRef.current.events.emit('relics-updated', updated);` (lines 154, 162)
  - `phaserGameRef.current.events.emit('resume-run-state', runState);` (line 214)
  Grep search for `perks-updated`, `relics-updated`, and `resume-run-state` in `src/game/` yields **0 listeners**.
- **Logic Chain**:
  1. The user purchases perks in the Confectionery Perk modal or equips relics in the Relic modal.
  2. React updates its meta-profile and emits `'perks-updated'` and `'relics-updated'` to Phaser.
  3. Phaser's `GameScene` ignores these events completely. The player's base speed, bomb power, and starting shields remain hardcoded to base values (`GameScene.ts:1018-1050`).
  4. Resuming a saved run emits `'resume-run-state'`. React sets `stats`, but Phaser continues running without restoring player position, score, board blocks, or entities.
- **Severity**: HIGH (Core progression and state persistence features do not affect active gameplay)
- **Remediation**:
  Add listeners in `GameScene.ts` for `'perks-updated'`, `'relics-updated'`, and `'resume-run-state'` to apply stat modifiers and restore run states.

---

#### 1.5 Leaked Event Listeners on Scene Restart
- **Location**: `src/game/GameScene.ts:1547`, `2643`
- **Observation**:
  `this.game.events.on('mode-changed', ...)` is added inside `create()` (line 1547).
  On player death, line 2643 calls `this.scene.restart()`.
  `GameScene` has no `shutdown` or `destroy` lifecycle method to remove listeners from `this.game.events`.
- **Logic Chain**:
  1. Each time the player dies and the scene restarts, `create()` executes again.
  2. Another listener callback is appended to `this.game.events`.
  3. After $N$ deaths, emitting `'mode-changed'` executes the handler $N+1$ times, multiplying calls to `startBossEncounter` or `dismissBoss`.
- **Severity**: MEDIUM (Memory leak & duplicate handler executions)
- **Remediation**:
  Store listener references and remove them in a scene `shutdown` event handler (`this.events.once(Phaser.Scenes.Events.SHUTDOWN, ...)`).

---

#### 1.6 Unpersisted Currency Rewards
- **Location**: `src/components/BombermanGame.tsx:454-459`
- **Observation**:
  ```typescript
  const handleCurrencyReward = (rewards: { starCandies?: number; cosmicEssence?: number }) => {
    if (rewards.starCandies) setStarCandies((c) => c + rewards.starCandies!);
    if (rewards.cosmicEssence) setCosmicEssence((e) => e + rewards.cosmicEssence!);
  };
  phaserGame.events.on('currency-reward', handleCurrencyReward);
  ```
- **Logic Chain**:
  When a boss is defeated (`GameScene.ts:1984`), `currency-reward` emits +50 starCandies and +25 cosmicEssence.
  React updates component state, but **does not invoke `syncMetaProfile()`**.
  If the player refreshes the page or navigates away without opening/closing another modal, the earned rewards are lost.
- **Severity**: MEDIUM (Progress loss on page unload)
- **Remediation**:
  Call `syncMetaProfile({ starCandies: newCandies, cosmicEssence: newEssence })` inside `handleCurrencyReward`.

---

### 2. Mobile Touch Controls

#### 2.1 NippleJS Virtual Joystick Angle Dead Zones
- **Location**: `src/components/BombermanGame.tsx:497-502`
- **Observation**:
  ```typescript
  manager.on('move', (evt) => {
    const angle = evt.data.angle.degree;
    window.mobileInput.up = angle > 45 && angle < 135;
    window.mobileInput.down = angle > 225 && angle < 315;
    window.mobileInput.left = angle > 135 && angle < 225;
    window.mobileInput.right = (angle >= 0 && angle <= 45) || (angle >= 315 && angle <= 360);
  });
  ```
- **Logic Chain**:
  - Evaluate `angle = 135`:
    - `up`: `135 > 45 && 135 < 135` $\rightarrow$ **`false`**
    - `down`: `135 > 225 && 135 < 315` $\rightarrow$ **`false`**
    - `left`: `135 > 135 && 135 < 225` $\rightarrow$ **`false`**
    - `right`: `(135 >= 0 && 135 <= 45) || (135 >= 315 && 135 <= 360)` $\rightarrow$ **`false`**
    - Result: `up=false, down=false, left=false, right=false`!
  - Evaluate `angle = 225`:
    - `up`: **`false`**
    - `down`: `225 > 225 && 225 < 315` $\rightarrow$ **`false`**
    - `left`: `225 > 135 && 225 < 225` $\rightarrow$ **`false`**
    - `right`: **`false`**
    - Result: `up=false, down=false, left=false, right=false`!
- **Impact**:
  When a player drags the joystick to the up-left diagonal (135°) or down-left diagonal (225°), the character abruptly stops moving.
  Furthermore, the strict 4-way partition prevents diagonal intent, making corridor transitions clunky compared to 8-way directional thresholding.
- **Severity**: HIGH (Direct control freeze on mobile)
- **Remediation**:
  Use continuous circular or 8-directional inclusive angle mapping with a deadzone distance check:
  ```typescript
  if (evt.data.distance < 10) {
    window.mobileInput.up = window.mobileInput.down = window.mobileInput.left = window.mobileInput.right = false;
    return;
  }
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  window.mobileInput.right = cos > 0.38;
  window.mobileInput.left = cos < -0.38;
  window.mobileInput.up = sin > 0.38;
  window.mobileInput.down = sin < -0.38;
  ```

---

#### 2.2 Action Button Multi-Touch & Rapid Tap Race Condition
- **Location**: `src/components/BombermanGame.tsx:514-534`, `GameScene.ts:1685`, `1715`
- **Observation**:
  ```typescript
  const handleBombPress = () => {
    if (window.mobileInput) {
      window.mobileInput.bomb = true;
      setTimeout(() => {
        if (window.mobileInput) {
          window.mobileInput.bomb = false;
        }
      }, 100);
    }
  };
  ```
- **Logic Chain**:
  1. `GameScene.ts:1715` already consumes the input on the very next frame: `if (mInput.bomb) mInput.bomb = false;`.
  2. If the user taps the button rapidly twice within 100ms (e.g. at $t=0$ and $t=80\text{ms}$):
     - Tap 1 sets `bomb = true` and starts Timer 1 for $t=100\text{ms}$.
     - Game frame consumes Tap 1 at $t=16\text{ms}$ (`bomb = false`).
     - Tap 2 sets `bomb = true` at $t=80\text{ms}$ and starts Timer 2 for $t=180\text{ms}$.
     - At $t=100\text{ms}$, Timer 1 fires and unconditionally executes `window.mobileInput.bomb = false`!
     - If the game frame runs at $t=105\text{ms}$, Tap 2 is lost.
- **Severity**: MEDIUM (Lost inputs during rapid bomb placement / dash execution)
- **Remediation**:
  Since `GameScene.ts` already clears `mInput.bomb = false` upon consumption, remove the unconditional `setTimeout` or track a press timestamp/counter.

---

#### 2.3 Missing Pointer Cancel, Leave & Capture on Mobile Buttons
- **Location**: `src/components/BombermanGame.tsx:1117-1165`
- **Observation**:
  - Ultimate button (`lines 1119-1120`): `onPointerDown={handleUltimatePress}`, `onPointerUp={handleUltimateRelease}`.
  - No `onPointerCancel`, `onPointerLeave`, or `setPointerCapture`.
  - Dash and Bomb buttons (`lines 1143`, `1157`): only `onPointerDown`.
- **Logic Chain**:
  - If a player holds the Ultimate button and drags their thumb outside the 64px circular bounds, `onPointerUp` will not fire on the button.
  - If an OS touch gesture (incoming notification, app switcher) triggers a `touchcancel` event, `onPointerUp` is swallowed.
- **Severity**: MEDIUM (Stuck button press state or missed release)
- **Remediation**:
  Add `onPointerCancel` and `onPointerLeave` handlers to all mobile touch buttons, or call `e.currentTarget.setPointerCapture(e.pointerId)`.

---

#### 2.4 Mobile Inventory Toggle Latency
- **Location**: `src/components/BombermanGame.tsx:1101`
- **Observation**:
  ```tsx
  <button 
    type="button"
    onClick={() => setIsInventoryOpen(true)}
    aria-label="Open Inventory Drawer"
    className="... select-none touch-none cursor-pointer"
  >
  ```
- **Logic Chain**:
  Using `onClick` with `touch-none` on mobile devices introduces standard 300ms click delay or dropped click events if the touch position shifts slightly during press.
- **Severity**: LOW-MEDIUM (Touch unresponsiveness)
- **Remediation**:
  Use `onPointerDown` instead of `onClick`.

---

### 3. HUD Synchronization

#### 3.1 Cooldown & Lockout Gauge Breakdown
- **Observation Summary**:
  | HUD Metric | Phaser Variable | Decrement Frequency | Stats Update Emission | React Visual Behavior |
  |---|---|---|---|---|
  | **Dash Cooldown** | `dashCooldownRemaining` | Per frame (`delta`) | Only when $\le 0$ (`GameScene:1639`) | Displays `3.5s` frozen until ready |
  | **Ultimate Lockout** | `ultimateLockoutRemaining` | Per frame (`delta`) | Only when $\le 0$ (`GameScene:1604`) | Displays `6.0s` frozen until ready |
  | **Active Buffs** | `activeBuffs[].remainingMs` | Per frame (`delta`) | Only when expired (`GameScene:1661`) | Displays `8.0s` frozen until expiration |
  | **Boss Stun Timer** | `bossHUD.state.stunRemainingMs` | NEVER (missing `update()`) | NEVER decrements | Displays `💫 STUNNED 2.2s` forever |
  | **Active Bombs** | `activeBombs` | On plant / explode | Immediate on plant/explode | Correct in normal play; death delayedCall misses emit |

- **Severity**: HIGH (HUD fails to reflect real-time game timers)

---

### 4. Inventory Drawer, Modals & Accessibility

#### 4.1 Global Keydown Conflict with Modals & Input Fields
- **Location**: `src/components/BombermanGame.tsx:378-416`
- **Observation**:
  ```typescript
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!window.mobileInput) return;
    const key = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'e', 'r', 'q'].includes(key) || e.code === 'Space') {
      e.preventDefault();
    }
    ...
  };
  ```
- **Logic Chain**:
  1. The event listener is attached to `window`.
  2. It does not check whether any modal is open (`isExportImportModalOpen`, `isPerkModalOpen`, `isRelicModalOpen`, `isInventoryOpen`).
  3. It does not check `e.target` (e.g. whether the focused element is a `<textarea>` or `<input>`).
  4. In the Backup & Sync modal (`BombermanGame.tsx:1612-1620`), there is a `<textarea>` where the user pastes save JSON.
  5. If the user presses Space, `e.preventDefault()` prevents typing a space into the textarea!
  6. Furthermore, pressing `E`, `R`, `Q` or `Space` simultaneously triggers `mobileInput.dash = true`, `mobileInput.ultimate = true`, and `mobileInput.bomb = true` in the game running behind the modal!
- **Severity**: CRITICAL (Breaks user input in modal textareas, unwanted background actions)
- **Remediation**:
  Check `if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;` and ignore game hotkeys when any modal is open.

---

#### 4.2 Modal Dismissal & Accessibility Deficiencies
- **Location**: `src/components/BombermanGame.tsx:1171`, `1283`, `1422`, `1522`
- **Observation**:
  - None of the four modals handle the `Escape` key.
  - Modals lack ARIA attributes (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`).
  - No focus management or focus trapping (pressing `Tab` tabs into the hidden arcade controls or address bar behind the backdrop).
- **Severity**: MEDIUM (Keyboard navigation and accessibility non-compliance)
- **Remediation**:
  Add an `Escape` key listener on `window` to close the topmost open modal, and add appropriate ARIA modal attributes.

---

#### 4.3 Desktop Tooltip Horizontal Clipping
- **Location**: `src/components/BombermanGame.tsx:908-910`
- **Observation**:
  ```tsx
  {hoveredDesktopItem?.id === item.id && (
    <div className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 p-3 rounded-xl bg-slate-900/95 ...">
  ```
  The parent container (`BombermanGame.tsx:561`) has `overflow-hidden`.
  The tooltip is `w-64` (256px wide) centered on the item badge.
- **Logic Chain**:
  When hovering an item badge located near the far left of the Arsenal container, `-translate-x-1/2` projects the tooltip 128px to the left of the item center.
  If the item center is within 128px of the container boundary, the left side of the tooltip extends outside the container.
  Because the container has `overflow-hidden`, the tooltip is clipped.
- **Severity**: LOW-MEDIUM (Visual clipping on smaller desktop resolutions)
- **Remediation**:
  Use edge-aware tooltip alignment (e.g. `left-0` for first few items, `right-0` for last items, or portal tooltip to body).

---

#### 4.4 Missing Inventory Drawer Open/Close Animation
- **Location**: `src/components/BombermanGame.tsx:1171-1182`
- **Observation**:
  The mobile drawer renders directly via `{isInventoryOpen && (...)}` without CSS slide or fade transition classes.
- **Impact**:
  The drawer abruptly pops into view and disappears on close rather than smoothly sliding up from the bottom of the screen.
- **Severity**: LOW (Polish / UX aesthetic)
- **Remediation**:
  Add CSS transition classes (`transition-all duration-300 ease-out translate-y-0`) or use CSS animation keyframes for enter/exit.

---

## Synthesis & Risk Matrix

| Finding ID | Component | Description | Impact | Risk Level |
|---|---|---|---|---|
| **F-01** | Bridge / HUD | Cooldowns & buffs don't emit while ticking down; HUD timers freeze | Broken UI feedback | **HIGH** |
| **F-02** | Boss HUD | `bossHUD.update(delta)` never called; boss stun timer frozen forever | Stuck boss UI state | **HIGH** |
| **F-03** | Bridge / Crisis | `CrisisManager` & `SituationLog` never instantiated in `GameScene` | Crisis gameplay unreachable | **HIGH** |
| **F-04** | Controls / Mobile | NippleJS dead zones at 135° and 225° cause player to freeze | Game unplayable at diagonals | **HIGH** |
| **F-05** | Modals / Accessibility | Global keydown intercepts Space/E/R/Q in modal textareas & triggers game actions | Modal input broken, background actions | **CRITICAL** |
| **F-06** | Progression | `perks-updated` and `relics-updated` ignored by Phaser | Upgrades don't affect gameplay | **HIGH** |
| **F-07** | Persistence | `resume-run-state` ignored by Phaser; React/Phaser state desync | Corrupted resume state | **HIGH** |
| **F-08** | Memory / Lifecycle | `mode-changed` listener leaked on every scene restart | Memory leak, duplicate triggers | **MEDIUM** |
| **F-09** | Persistence | `currency-reward` does not trigger `syncMetaProfile` | Currency lost on page unload | **MEDIUM** |
| **F-10** | Controls / Mobile | Action button `setTimeout` races eat rapid-tap inputs | Lost button presses | **MEDIUM** |
| **F-11** | Controls / Mobile | Mobile buttons lack `pointercancel` and pointer capture | Stuck buttons on gestures | **MEDIUM** |
| **F-12** | Accessibility | No `Escape` key support, no focus trapping in modals | Accessibility violation | **MEDIUM** |
| **F-13** | Desktop HUD | Arsenal tooltip `w-64` overflows and clips in `overflow-hidden` | Truncated item descriptions | **LOW-MEDIUM** |
| **F-14** | Mobile Drawer | Inventory drawer lacks enter/exit animation | Abrupt visual pop | **LOW** |

---

## Actionable Remediation Plan

1. **Fix Bridge Real-Time Sync**:
   - In `GameScene.ts:update()`, call `this.bossHUD?.update(delta)`.
   - Add a throttled emission accumulator in `GameScene.ts:update()`: if `dashCooldownRemaining > 0`, `ultimateLockoutRemaining > 0`, or `activeBuffs.length > 0`, emit `stats-update` every 60ms–100ms.
2. **Wire Crises & Progression**:
   - Instantiate `CrisisManager` and `SituationLog` in `GameScene.ts`.
   - Listen for `'mode-changed'`, `'perks-updated'`, `'relics-updated'`, and `'resume-run-state'` in `GameScene.ts`.
   - Add a Scene shutdown hook to unregister all listeners from `this.game.events`.
3. **Fix Mobile Touch Controls**:
   - In `BombermanGame.tsx`, replace the discrete 4-way angle comparisons with trigonometry-based deadzoned direction mapping.
   - Remove unconditional `setTimeout` resets from mobile buttons or guard them with tap counters.
   - Add `onPointerCancel` and `setPointerCapture` to mobile touch controls.
4. **Fix Modal Input & Accessibility**:
   - In `handleKeyDown`, guard against `target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement` and ignore game shortcuts when modals are open.
   - Add an `Escape` key listener to dismiss active modals.
   - Fix Arsenal tooltip positioning to stay within viewport bounds.
