# Handoff Report: UI & Graphics Subsystem Total Inspection (총검사)

- **Auditor Role**: UI & Graphics Auditor (explorer_inspect_ui_2)
- **Target Subsystems**: 2.5D RENDER_DEPTH & Dynamic Y-Sorting, OverheadUIManager & Name Tag Occlusion, Player Sprite Protection Bubble, FloatingTextManager Cascade, Camera Trauma & Hit-Stop, Particle Systems & Drop Shadows, React HUD & Mobile Controls.
- **Date**: 2026-09-29T14:08:00Z
- **Working Directory**: `/Users/user/src/bomberman/.agents/teamwork/explorer_inspect_ui_2`

---

## 1. Observation

### 1.1 Test Suite & Build Baselines
Executed commands:
- `npm test`: 644/644 tests passed across 41 suites in 1.96s (exit code 0).
- `node --test tests/ui_depth_declutter.test.mjs tests/juice_game_feel.test.mjs tests/challenger_m2_bubble_cascade_depth.test.mjs tests/challenger_m2_overhead_stress.test.mjs tests/m3_challenger_bomb_hitstop_trauma_stress.test.mjs`: 78/78 tests passed in 375ms (exit code 0).
- `npm run lint`: 0 errors, 39 unused-var warnings (exit code 0).
- `npm run build`: Next.js 16.3.5 Turbopack production build succeeded in 406ms (exit code 0).

---

### 1.2 Subsystem Observations & Code Inspection

#### A. 2.5D RENDER_DEPTH & Dynamic Y-Sorting
1. **Depth Hierarchy Definition** (`src/game/entities/types.ts:15-52`):
   ```typescript
   export const RENDER_DEPTH = {
     BACKGROUND: -10, FLOOR: 0, WALLS: 1, BLOCKS: 2, DECALS: 3, PORTALS: 4,
     ITEM_GLOW: 5, ITEMS: 6, BOMBS: 7, TELEGRAPHS: 8, CRISIS_HAZARDS: 9,
     ENTITY_Y_BASE: 100, ENTITY_Y_SCALE: 1.0,
     OFFSET_SHADOW: -0.1, OFFSET_SPRITE: 0.0, OFFSET_SHIELD: 0.1,
     OFFSET_HP_BAR: 0.2, OFFSET_NAME_TAG: 0.3, OFFSET_INTENT_BADGE: 0.4,
     EXPLOSIONS: 750, SHOCKWAVES: 760, DEBRIS_PARTICLES: 770,
     BOSS_BODY: 800, BOSS_VFX: 810, FLOATING_TEXT: 900, SCREEN_OVERLAY: 950,
   } as const;
   ```
2. **Discrepancy in Entity Drop Shadow Depth**:
   - `types.ts:33` defines `OFFSET_SHADOW: -0.1`, which implies dynamic Y-depth `100 + y * 1.0 - 0.1`.
   - In `src/game/entities/BaseEntity.ts:287`:
     ```typescript
     this.dropShadow.setDepth(6);
     ```
   - In `src/game/GameScene.ts:519` (`attachEntityDropShadow`):
     ```typescript
     shadow.setDepth(6);
     ```
   - In `src/game/GameScene.ts:575` & `892` (`playerDropShadow`):
     ```typescript
     this.playerDropShadow.setDepth(6);
     ```
   - In `tests/juice_game_feel.test.mjs:549`:
     ```javascript
     assert.equal(shadow.depth, 6, 'Entity drop shadow depth must be exactly 6');
     ```
   - **Observed Layer Collision**: Items are at depth 6 (`RENDER_DEPTH.ITEMS = 6`), bombs are at depth 7 (`RENDER_DEPTH.BOMBS = 7`), telegraphs are at depth 8 (`TELEGRAPHS = 8`), and crisis hazards are at depth 9 (`CRISIS_HAZARDS = 9`). An entity at $y=300$ has sprite depth $400.0$, but its shadow is at depth $6$, which places the shadow underneath bombs, telegraphs, hazards, and under any entity positioned to its north ($y \ge 0 \implies \text{depth} \ge 100$).
3. **Hardcoded Entity Spawn Depths**:
   - In `src/game/entities/BaseEntity.ts:102`:
     ```typescript
     this.setDepth(9);
     ```
     Initial constructor depth is hardcoded to 9 (`RENDER_DEPTH.CRISIS_HAZARDS`), placing un-updated entities beneath the 100–700 entity band.
   - In `src/game/entities/OverheadUI.ts:66, 86, 99`:
     ```typescript
     this.hpGraphics.setDepth(16);
     this.nameTag.setDepth(16);
     this.indicator.setDepth(17);
     ```
     Constructor defaults are 16 and 17, placing labels beneath entities until `OverheadUIManager.update()` runs.
4. **Hardcoded Ultimate VFX Depths in `src/game/ultimate_skills.ts`**:
   - Line 836 & 840 (`renderChronoStasisVFX`):
     ```typescript
     overlay.setDepth(30);
     border.setDepth(31);
     ```
     `RENDER_DEPTH.SCREEN_OVERLAY` is defined as 950. The Chrono Freeze full-screen stasis tint at depth 30 renders underneath entities (100–700), explosions (750), shockwaves (760), and bosses (800).
   - Line 788 (`renderSuperNovaWave`):
     ```typescript
     g.setDepth(25);
     ```
     `RENDER_DEPTH.SHOCKWAVES` is 760. Super Nova chromatic shockwaves render at depth 25 beneath ground entities.
   - Line 736, 740, 758 (`renderMeteorStreak`):
     ```typescript
     meteor.setDepth(24);
     corona.setDepth(23);
     ember.setDepth(22);
     ```
     Descending atmospheric meteor strikes render at depths 22–24 underneath entities on the ground.
   - Line 892 (`renderCorridorTelegraph`): `g.setDepth(15)`.
   - In `src/game/entities/BaseEntity.ts:195`: Death sparks use `spark.setDepth(14);`, rendering beneath entity bodies.
   - In `src/game/entities/AllyEntities.ts:277, 353`: Turret bolt uses `bolt.setDepth(15);` and Guardian ring uses `ring.setDepth(12);`.

---

#### B. OverheadUIManager & Name Tag Occlusion
1. **AABB & Spring Repulsion** (`src/game/GameScene.ts:223-269`):
   - AABB overlap criteria: `dx < requiredW && dy < requiredH` (`requiredW`: 24px minimal, 44px compact, 88px full; `requiredH = 16`).
   - Horizontal spring repulsion when `dx >= 24`:
     ```typescript
     const overlapX = requiredW - dx;
     const shift = overlapX / 2;
     offsetsX[i] -= shift;
     offsetsX[j] += shift;
     ```
   - Vertical staggering when tightly aligned (`dx < 24`):
     ```typescript
     if (eA.y <= eB.y) {
       offsetsY[i] = -14;
       offsetsY[j] = 46;
     } else {
       offsetsY[i] = 46;
       offsetsY[j] = -14;
     }
     ```
2. **Observed Staggering Overwrite Flaw**:
   - `offsetsY` uses direct scalar assignment (`= -14`, `= 46`) instead of accumulation or a multi-body resolution pass.
   - When 3 entities ($E_0, E_1, E_2$) are vertically aligned with $dx < 24$ and $dy < 16$:
     - Pair $(0, 1)$ sets `offsetsY[0] = -14; offsetsY[1] = 46;`.
     - Pair $(1, 2)$ sets `offsetsY[1] = -14; offsetsY[2] = 46;`.
     - `offsetsY[1]` is overwritten from $46$ to $-14$, resulting in both $E_0$ and $E_1$ having `offsetsY = -14`, re-colliding.
3. **Double Redraw per Frame**:
   - `BaseEntity.ts:290` calls `this.overheadUI.update(this.x, this.y, this.hp)`, which executes `this.renderHpBar(barX, barY)`.
   - `GameScene.ts:1877` calls `this.overheadUIManager.update(...)`, which inside `GameScene.ts:312` calls `entity.overheadUI.setCustomOffsets(ox, oy)`, which in turn calls `this.renderHpBar(barX, barY)` a second time (`OverheadUI.ts:203`).
   - Every active entity executes `hpGraphics.clear()` and full bar redraws twice per 60 FPS tick.

---

#### C. Player Sprite Protection Bubble
1. **Implementation** (`src/game/GameScene.ts:282-314`):
   ```typescript
   const lx = entity.x + ox;
   const ly = entity.y - 22 + oy;
   const distLabel = Math.hypot(lx - player.x, ly - player.y);
   const distBody = Math.hypot(entity.x - player.x, entity.y - player.y);
   const effectiveDist = Math.min(distLabel, distBody);

   if (effectiveDist <= 20) {
     targetAlpha = 0.0;
   } else if (effectiveDist <= 38) {
     targetAlpha = Math.min(0.15, 0.15 * ((effectiveDist - 20) / (38 - 20)));
   }
   ```
2. **Boundary Discontinuity**:
   - At $\text{effectiveDist} = 38.0\text{px}$, $\text{targetAlpha} = 0.15$.
   - At $\text{effectiveDist} = 38.01\text{px}$, $\text{targetAlpha} = 1.0$.
   - While the exponential lerp (`lerpFactor = Math.min(1.0, delta * 0.015)`) filters instantaneous snaps, the target alpha undergoes an 85% step change across the boundary.

---

#### D. FloatingTextManager Cascade
1. **Implementation** (`src/game/GameScene.ts:323-372`):
   - Sliding window cutoff: `cutoff = currentTime - 450`.
   - Circular buffer head pointer eviction with slice cleanup when `head > 128`.
   - Proximity check: $dx^2 + dy^2 \le 900$ ($R = 30\text{px}$).
   - Cumulative vertical cascade offset: `offset = nearbyCount * 16`.
   - Depth: `floating.setDepth(RENDER_DEPTH.FLOATING_TEXT);` (900).
2. **Allocation Mechanics** (`GameScene.ts:3616`):
   - `spawnFloatingText` instantiates a new `this.add.text(...)` and tween for every floating label, destroying it via `floating.destroy()` on completion.
   - `ObjectPool<Phaser.GameObjects.Text>` specified in `PROJECT.md:7` is not utilized here.

---

#### E. Camera Trauma & Hit-Stop
1. **CameraTraumaSimulator** (`src/game/ultimate_skills.ts:163-217`):
   - Non-linear square law: `factor = this.trauma * this.trauma`.
   - Clamped to $[0.0, 1.0]$ with `decayRate = 1.4` $s^{-1}$.
   - Harmonics: `Math.sin(t * 1.37) * 0.65 + Math.cos(t * 2.11) * 0.35`.
   - Zero heap allocation: reuse of `_scratchOffsets` and `_scratchMagnitude`.
   - Camera application in `GameScene.ts:1481`:
     ```typescript
     this.cameras.main.setScroll(this.baseScrollX + shake.x, this.baseScrollY + shake.y);
     this.cameras.main.setRotation(shake.angle * (Math.PI / 180));
     ```
2. **Background Scroll Decoupling**:
   - `GameScene.ts:862`: `bg.setScrollFactor(0);`.
   - Camera scroll translation moves the world sprites while `bg` stays stationary, resulting in parallax shearing between the background graphic and the shaking arena.
3. **Hit-Stop Lifecycle Leak**:
   - `GameScene.ts:490-514`: `triggerHitStop(durationMs)` executes `this.physics.world.pause(); this.isHitStopActive = true;`.
   - In `GameScene.ts:651-677` (`shutdown()`) and lines 706-764 (`create()`): `this.isHitStopActive` is not reset to false, and `if (this.physics?.world?.isPaused) this.physics.world.resume();` is not executed.
   - If a scene restart or defeat transition occurs while a 35–70ms hit-stop is active, the paused physics state can persist into the reinitialized scene.

---

#### F. Particle Systems & Drop Shadows
1. **Pre-allocated Zero-GC Emitters** (`GameScene.ts:771-819`):
   - `dustEmitter`: `particle_dust`, depth 770, emitted during player movement (line 556) and entity movement (BaseEntity.ts:268).
   - `bombSparkEmitter`: `particle_spark`, depth 770, emitted at fuse tip `(bomb.x + 9, bomb.y - 15)` with 35% probability (line 1708).
   - `blockDebrisEmitter`: `particle_debris`, depth 770, exploded with 8 particles on soft block demolition (line 2834).
2. **Unpooled Ad-Hoc Particle Allocations**:
   - `spawnPickupParticles` (`GameScene.ts:3639`): Instantiates 6 `this.add.circle(...)` GameObjects and 6 tweens per item collected.
   - `BaseEntity.ts:194`: Instantiates 6 `this.scene.add.circle(...)` GameObjects on entity death.
3. **Item & Block Shadows**:
   - Item hover shadow (`GameScene.ts:3491`): Sprite at depth 3 with inverse breathing tween; destroyed via `Phaser.GameObjects.Events.DESTROY` event listener.
   - Wall and block ambient occlusion shadow (`GameScene.ts:1291, 1330`): Rectangle at depth 1, offset 4px south; block shadow destroyed on block demolition (line 2829).

---

#### G. React HUD & Mobile Controls
1. **NippleJS Joystick Partitioning** (`src/components/BombermanGame.tsx:537-542`):
   - 8-way sector coverage:
     - `up = norm >= 22.5 && norm <= 157.5`
     - `down = norm >= 202.5 && norm <= 337.5`
     - `left = norm >= 112.5 && norm <= 247.5`
     - `right = norm <= 67.5 || norm >= 292.5`
   - Dead zone filter: `evt.data.distance < 5` clears inputs.
   - Clean destruction: `manager.destroy()` on unmount.
2. **Action Buttons**:
   - Bound to `onPointerDown`, `onPointerUp`, `onPointerCancel`, `onPointerLeave`.
   - Double `requestAnimationFrame` fallback reset guarantees at least one Phaser tick to consume input while preventing stuck buttons.
   - Missing `e.currentTarget.setPointerCapture(e.pointerId)`: Finger sliding outside button bounds triggers `onPointerLeave` prematurely.
3. **Event Bridges & Throttle**:
   - `statsTimerAccumulator` in `GameScene.ts:1450` emits stats every 100ms when cooldowns, lockouts, or buffs are active.
   - Global keyboard handler (`handleKeyDown`) excludes input events when `target.tagName === 'TEXTAREA' | 'INPUT' | isContentEditable`.

---

## 2. Logic Chain

```
[Observation 1.2.A.2: types.ts defines OFFSET_SHADOW = -0.1, but BaseEntity.ts:287 & GameScene.ts:519, 575 set depth 6]
  → Entities move dynamically along Y in band [100, 700].
  → Bombs have depth 7, telegraphs have depth 8, crisis hazards have depth 9.
  → Items have depth 6.
  → Conclusion: An entity at y=300 (depth 400) standing in front of a bomb at y=280 (depth 7) has its shadow drawn at depth 6 UNDER the bomb. When walking over items (depth 6), display-list Z-fighting occurs. Southern entities overlap northern entities' shadows incorrectly.

[Observation 1.2.A.4: ultimate_skills.ts sets Chrono Freeze to depth 30, Super Nova to depth 25, Meteor to depth 24]
  → RENDER_DEPTH defines ENTITY_Y_BASE = 100, EXPLOSIONS = 750, SHOCKWAVES = 760, SCREEN_OVERLAY = 950.
  → Conclusion: Screen stasis overlay at depth 30 fails to tint entities (100–700) or explosions (750). Super Nova shockwave at depth 25 expands under characters. Meteors at depth 24 fall behind standing entities.

[Observation 1.2.E.3: triggerHitStop pauses physics; shutdown() & create() do not reset isHitStopActive or resume physics]
  → If a scene transition or restart triggers while hit-stop is active (duration 35–70ms), the scheduled delayedCall unpause is abandoned.
  → Conclusion: Physics world remains permanently paused upon scene restart.

[Observation 1.2.B.2: offsetsY uses direct scalar assignment in pairwise loop]
  → 3 entities aligned vertically (dx < 24, dy < 16) process pair (0,1) then pair (1,2).
  → Entity 1 has offsetsY set to +46, then overwritten to -14.
  → Conclusion: Entity 0 and Entity 1 both end up with offsetsY = -14, causing their overhead labels to collide.

[Observation 1.2.B.3: BaseEntity.ts:290 and GameScene.ts:312 both call renderHpBar]
  → OverheadUI.update renders the HP bar.
  → OverheadUIManager.setCustomOffsets renders the HP bar a second time in the same frame tick.
  → Conclusion: Redundant graphics redraws (2x per entity per frame).
```

---

## 3. Caveats
- No changes to source code were applied during this turn in accordance with read-only investigation rules.
- Existing tests (`npm test`, 644/644 pass) test the hardcoded values (e.g. `tests/juice_game_feel.test.mjs:549` explicitly expects `shadow.depth === 6`). Updating shadow depth to use dynamic continuous sorting will require synchronizing the test assertions in `tests/juice_game_feel.test.mjs`.
- The background image `setScrollFactor(0)` provides a fixed border for the 800x600 canvas around the 600x520 playfield. If camera translation shake is applied to the background as well, the letterbox canvas background color (`#87CEEB`) will become briefly visible at the edges during high-trauma events unless the background image is oversized.

---

## 4. Conclusion & Recommended Remediation

### 4.1 Prioritized Defect Catalog

| ID | Severity | File & Lines | Description | Impact |
|---|---|---|---|---|
| **UI-DEF-01** | **HIGH** | `BaseEntity.ts:287`, `GameScene.ts:519, 575, 892` | Hardcoded shadow depth 6 vs `OFFSET_SHADOW: -0.1` | Entity shadows render behind bombs (7), telegraphs (8), hazards (9), and Z-fight with items (6) |
| **UI-DEF-02** | **HIGH** | `ultimate_skills.ts:836, 840, 788, 736` | Chrono Freeze (30), Super Nova (25), Meteor (24) depths | Stasis tint fails to cover entities; shockwaves & meteors render behind characters |
| **UI-DEF-03** | **HIGH** | `GameScene.ts:490-514, 651, 706` | Hit-stop physics pause unhandled in `shutdown()` and `create()` | Risk of permanent physics freeze if restart occurs during 35–70ms hit-stop window |
| **UI-DEF-04** | **MEDIUM** | `GameScene.ts:257-266` | `offsetsY` direct assignment in 3-entity columns | Label overlap between 1st and 2nd entity in 3-entity vertical stack |
| **UI-DEF-05** | **MEDIUM** | `BaseEntity.ts:102`, `OverheadUI.ts:66, 86, 99` | Initial spawn depths hardcoded to 9, 16, 17 | 1-frame depth glitch on entity spawn before first update tick |
| **UI-DEF-06** | **MEDIUM** | `BaseEntity.ts:195`, `AllyEntities.ts:277, 353` | Death sparks (14), Turret bolts (15), Guardian ring (12) depths | Combat projectiles and death sparks render behind entities (100–700) |
| **UI-DEF-07** | **LOW** | `GameScene.ts:298-300` | Target alpha step discontinuity at $R=38\text{px}$ (0.15 to 1.0) | Fluttering opacity when hovering near the 38px bubble boundary |
| **UI-DEF-08** | **LOW** | `BaseEntity.ts:290`, `GameScene.ts:312` | Double `renderHpBar()` call per entity per frame | Redundant canvas/WebGL draw calls for HP bars |
| **UI-DEF-09** | **LOW** | `GameScene.ts:3616, 3639`, `BaseEntity.ts:194` | Ad-hoc text/particle allocation bypassing object pools | Minor GC pressure during rapid item pickup or multi-kill demolition |
| **UI-DEF-10** | **LOW** | `src/components/BombermanGame.tsx:1290, 1316, 1333` | Missing pointer capture on mobile action buttons | Premature `pointerleave` on mobile touch drift |

---

### 4.2 Concrete Proposed Fixes

#### Fix 1: Harmonize Entity Drop Shadow to Dynamic Depth Band (`UI-DEF-01`)
In `BaseEntity.ts:287` and `GameScene.ts:575`:
```typescript
// Replace:
this.dropShadow.setDepth(6);
// With:
const baseDepth = RENDER_DEPTH.ENTITY_Y_BASE + this.y * RENDER_DEPTH.ENTITY_Y_SCALE;
this.dropShadow.setDepth(baseDepth + RENDER_DEPTH.OFFSET_SHADOW);
```

#### Fix 2: Correct Ultimate VFX Depths (`UI-DEF-02`)
In `src/game/ultimate_skills.ts`:
- Line 836: `overlay.setDepth(RENDER_DEPTH.SCREEN_OVERLAY);` (950)
- Line 840: `border.setDepth(RENDER_DEPTH.SCREEN_OVERLAY + 1);` (951)
- Line 788: `g.setDepth(RENDER_DEPTH.SHOCKWAVES);` (760)
- Line 736: `meteor.setDepth(RENDER_DEPTH.EXPLOSIONS + 10);` (760)
- Line 740: `corona.setDepth(RENDER_DEPTH.EXPLOSIONS + 9);` (759)
- Line 758: `ember.setDepth(RENDER_DEPTH.EXPLOSIONS + 8);` (758)

#### Fix 3: Hit-Stop Lifecycle Guard (`UI-DEF-03`)
In `GameScene.ts` inside `shutdown()` and `create()`:
```typescript
// In shutdown() and create():
if (this.isHitStopActive) {
  this.isHitStopActive = false;
  if (this.physics && this.physics.world && this.physics.world.isPaused) {
    this.physics.world.resume();
  }
}
```

#### Fix 4: Stacking Vertical Staggering (`UI-DEF-04`)
In `GameScene.ts:257-266`:
```typescript
} else {
  // Tightly stacked horizontally (dx < 24px) -> vertical staggering!
  if (eA.y <= eB.y) {
    offsetsY[i] = Math.min(offsetsY[i], -14);
    offsetsY[j] = Math.max(offsetsY[j], 46);
  } else {
    offsetsY[i] = Math.max(offsetsY[i], 46);
    offsetsY[j] = Math.min(offsetsY[j], -14);
  }
}
```

#### Fix 5: Spawn Depth Initialization (`UI-DEF-05`)
In `BaseEntity.ts:102`:
```typescript
const initialDepth = RENDER_DEPTH.ENTITY_Y_BASE + y * RENDER_DEPTH.ENTITY_Y_SCALE + RENDER_DEPTH.OFFSET_SPRITE;
this.setDepth(initialDepth);
```

---

## 5. Verification Method

### Independent Test Commands
1. Run full test suite:
   ```bash
   npm test
   ```
2. Run UI & graphics tests:
   ```bash
   node --test tests/ui_depth_declutter.test.mjs tests/juice_game_feel.test.mjs tests/challenger_m2_bubble_cascade_depth.test.mjs tests/challenger_m2_overhead_stress.test.mjs tests/m3_challenger_bomb_hitstop_trauma_stress.test.mjs
   ```
3. Run lint & build checks:
   ```bash
   npm run lint
   npm run build
   ```

### Recommended Permanent Defensive Tests
Add test cases in a new test file or append to `tests/ui_depth_declutter.test.mjs`:
1. **Defensive Test 1: Hit-Stop Shutdown Invariant**:
   Assert that triggering `scene.triggerHitStop(50)` followed immediately by `scene.shutdown()` or `scene.create()` leaves `scene.physics.world.isPaused === false` and `scene.isHitStopActive === false`.
2. **Defensive Test 2: Ultimate VFX RENDER_DEPTH Partitioning**:
   Assert that Chrono Freeze overlay depth $> \text{BOSS\_VFX}$ and $\ge \text{SCREEN\_OVERLAY}$, and Super Nova shockwave depth $\ge \text{SHOCKWAVES}$.
3. **Defensive Test 3: 3-Entity Vertical Staggering Non-Overlap**:
   Instantiate 3 entities in a vertical column ($x=300, y \in [200, 210, 220]$) and assert that all 3 resulting label $Y$ positions $(y + \text{offsetY})$ are mutually separated by at least $14\text{px}$.
4. **Defensive Test 4: Dynamic Shadow Sorting vs Ground Objects**:
   Assert that for an entity at $y=300$, its drop shadow depth is $> \text{RENDER\_DEPTH.BOMBS}$ and $> \text{RENDER\_DEPTH.CRISIS\_HAZARDS}$, while remaining $< \text{spriteDepth}$.
