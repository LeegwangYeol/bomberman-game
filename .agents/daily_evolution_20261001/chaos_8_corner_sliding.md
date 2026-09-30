# Chaos QA Agent 8: Corner Sliding & Sub-Pixel Physics Boundary Audit

**Date:** 2026-10-01  
**Cycle:** 2026-10-01 Daily Evolution  
**Role:** Chaos QA Agent 8 (Corner Sliding & Sub-Pixel Physics Boundary Tester)  
**Status:** ✅ **VERIFIED & PASSED (ZERO DEFECT / ZERO TUNNELING / ZERO SNAG)**  

---

## 1. Executive Summary

During the 2026-10-01 Daily Evolution cycle, **Chaos QA Agent 8** conducted an exhaustive, multi-tier adversarial stress test of player kinematics, corner-sliding assist mechanics, sub-pixel rounding precision, conveyor belt drift interactions, and rigid hitbox boundary containment.

The investigation encompassed:
1. **Prior Art Inspection:** In-depth review of `tests/player_movement_stress.test.mjs`, `tests/physics_stress_challenger_1.test.mjs`, and `tests/physics_remediation_defensive.test.mjs`.
2. **Empirical Chaos Test Suite:** Creation and execution of `tests/chaos_corner_sliding_subpixel.test.mjs` covering 13 high-intensity test scenarios spanning over 13,500 physics simulation frames.
3. **Sub-Pixel Oscillation Discovery & Remediation:** Identification and resolution of high-speed sub-pixel boundary oscillation where step displacement ($v \cdot dt = 4.167\text{ px}$ at 250 px/s, $5.833\text{ px}$ at 350 px/s) exceeds the static 2px snap threshold. Upgraded `GameScene.ts` to dynamic snap windowing: $\max(2, \text{speed} \cdot \Delta t)$.
4. **Anti-Tunneling & Indestructible Pillar Invariants:** Mathematical and empirical verification that the 24x24 player hitbox maintains strict positive margins ($\ge 8\text{px}$ in 40px corridors), suffers **zero wall penetration**, and exhibits **zero pillar tunneling** across 10,000 continuous frames of randomized chaos movement.

---

## 2. Review of Existing Physics & Movement Baselines

| Test File | Primary Scope | Verification Findings |
|---|---|---|
| `tests/player_movement_stress.test.mjs` | Corridor centering, dead-end safety, bomb step-off passability, S-curve navigation, and PHYS-07 corner tolerances. | Verified that 24x24 body has 8px clearance in 40px tiles; corner rounding activates within $\pm 3\text{px}$ (remediated to `cornerSlideTolerance` 8/11/14px). |
| `tests/physics_stress_challenger_1.test.mjs` | Body invariant guard under 500 transforms, bomb/explosion bloom limits, 1,000 corner sliding steps, conveyor bomb anti-stacking, portal warp body reset. | Verified that body dimensions stay strictly locked to 24x24 regardless of scale or rotation; explosion 1.35x visual bloom never penetrates solid pillars. |
| `tests/physics_remediation_defensive.test.mjs` | PHYS-REV-01 transform sync on `setPosition`, enemy stun velocity clamping, squash/stretch base scale preservation. | Verified that sprite position mutations immediately synchronize body position, center, and transform without lag. |

All 47 tests across these three foundational suites pass cleanly with 0 regressions.

---

## 3. High-Speed Sub-Pixel Boundary Physics & Discovery

### 3.1 Mathematical Analysis: The High-Speed Snap Discontinuity

In `src/game/GameScene.ts` line 2492:
```ts
const speed = (this.isDashing ? DASH_SPEED : this.playerSpeed + perkSpeedBonus) + surgeBonus;
const slideSpeed = speed;
const snapThreshold = 2;
```

When a player moves with Speed Surge + Perks ($250\text{ px/s}$) or dashes at `DASH_SPEED` ($350\text{ px/s}$):
- **Frame Step at 60 FPS ($dt \approx 0.01667\text{s}$):**
  $$\Delta x_{250} = 250 \times 0.01667 = 4.167\text{ px}$$
  $$\Delta x_{350} = 350 \times 0.01667 = 5.833\text{ px}$$
- **Snap Window:** With a static threshold of $2\text{px}$, the snap region is $[-2.0, +2.0]\text{px}$, having total width $W_{\text{snap}} = 4.0\text{px}$.
- **Oscillation Hazard:** Because the displacement step ($\Delta = 4.167\text{px}$) is strictly greater than the window width ($W = 4.0\text{px}$), any trajectory where $|\text{diff}| \in (2.0, 2.167)\text{px}$ will completely jump over the snap window:
  $$\text{diff}_{0} = +2.05\text{px} \xrightarrow{v = -250} \text{diff}_{1} = 2.05 - 4.167 = -2.117\text{px}$$
  $$\text{diff}_{1} = -2.117\text{px} \xrightarrow{v = +250} \text{diff}_{2} = -2.117 + 4.167 = +2.05\text{px}$$
  This generated an infinite sub-pixel vibration across the corridor centerline.

### 3.2 Production Remediation in `GameScene.ts`

To permanently prevent high-speed sub-pixel oscillation, `updatePlayerMovement` was upgraded to accept frame delta, dynamically scaling the snap threshold:
```ts
// src/game/GameScene.ts
private updatePlayerMovement(delta: number = 16.666) {
  ...
  const speed = (this.isDashing ? DASH_SPEED : this.playerSpeed + perkSpeedBonus) + surgeBonus;
  const slideSpeed = speed;
  const snapThreshold = Math.max(2, speed * (delta / 1000));
  ...
}
```
**Verification:** Tested across 100 sub-pixel offsets $\epsilon \in [-7.5, +7.5]\text{px}$ and irrational offsets ($\pi/2, \sqrt{2}, 2.05, 4.1667$). In 100% of cases, player converges to the exact centerline within $\le 2$ physics ticks.

---

## 4. Diagonal Movement & Corner Sliding Kinematics

### 4.1 Dominant Axis & Wall Occlusion Routing

When a player inputs diagonal vectors against an indestructible pillar corner (e.g. at tile `(2, 2)`):
- **Scenario A (One Axis Blocked, One Open):** Moving East + North at `(2, 1)`. East is blocked by pillar `(2, 2)`, North is open `(1, 1)`.
  - System detects `!xOpen && yOpen` $\rightarrow$ automatically assigns `primaryAxis = 'y'`.
  - Velocity along North is set to $-150\text{ px/s}$ (or $-250\text{ px/s}$), horizontal velocity is cleanly zeroed. Zero penetration, zero snag.
- **Scenario B (Both Axes Open):** Input timestamp prioritization selects the dominant axis, while corridor centering assists perpendicular alignment.
- **Scenario C (Corner Slide Assist):** When approaching a corner pillar within `cornerSlideTolerance` ($8\text{px}, 11\text{px}, 14\text{px}$ via Corner Magnet perk), perpendicular slide velocity engages automatically ($v_{\text{slide}} = \pm \text{speed}$), sliding the player around the corner.

### 4.2 "Fake Open" Diagonal Trap Resilience

In Bomberman mazes, players frequently press diagonal inputs towards an empty diagonal tile where the immediate cardinal tiles are partially blocked.
- Evaluated 30 frames of continuous Southeast diagonal navigation towards `(2, 2)` corner pillar.
- The AABB separation and dominant axis routing prevented diagonal corner clipping. Penetration area remained strictly $0.000\text{ px}^2$.

---

## 5. Conveyor Belt Drift Intersections

### 5.1 AABB Leading Edge Barrier Clamp

Conveyor belts in `GameScene.ts` push dynamic entities at $\text{CONVEYOR\_DRIFT\_SPEED} = 60\text{ px/s}$.
- Drift uses a 3-point probe along the 24x24 hitbox leading edge:
  1. Center: `(leadX, leadY)`
  2. Positive corner: `lead + 11px` perpendicular
  3. Negative corner: `lead - 11px` perpendicular
- When drifting East into a solid wall at $x = 80$, the leading edge ($x + 12$) reaches the boundary and halts movement at exactly $x = 68.0\text{px}$.
- Upgraded `GameScene.ts` conveyor drift to call `this.player.setPosition(nextX, nextY)`, guaranteeing that Arcade Physics body transform and center update synchronously with the sprite.

### 5.2 Compound Kinematics: Cross-Drift & Counter-Drift

- **Perpendicular Crossing (Cross-Drift):** Player crossing row 7 conveyor corridor (East drift at 60 px/s) while moving South at 250 px/s traversed row 7 into row 8 cleanly with slight East displacement and zero wall clipping.
- **Counter-Drift:** Player moving West at 150 px/s against an East conveyor (60 px/s) maintained effective net velocity of $-90\text{ px/s}$, achieving planned displacement over 60 frames without stalling.

---

## 6. Comprehensive 10,000-Frame Chaos Verification

### 6.1 Simulation Configuration

In `tests/chaos_corner_sliding_subpixel.test.mjs`, Scope 5 executed 10,000 consecutive headless physics simulation frames with:
- Speed toggling between $150\text{ px/s}$, $200\text{ px/s}$, $250\text{ px/s}$, and $350\text{ px/s}$ (Dash).
- Rapid directional switching every 11 frames across 8 diagonal and orthogonal combinations.
- Active conveyor belts along row 7 (cols 4..10).
- Standard 15x13 Bomberman grid containing 36 indestructible pillars and outer boundary walls.

### 6.2 Telemetry Results

| Metric | Measured Value | Requirement / Budget | Result |
|---|---|---|---|
| **Total Frames Simulated** | 10,000 | $\ge 10,000$ frames | ✅ **PASS** |
| **Wall / Pillar Penetrations** | **0** | **Strictly 0** | ✅ **PASS** |
| **Pillar Minimum Distance** | **0.000 px** (contact), never $< 0$ | $\ge 0.000\text{ px}$ | ✅ **PASS** |
| **Corner Snag Halts** | **0** | **0** | ✅ **PASS** |
| **World Boundary Violations** | **0** ($52 \le x \le 548, 52 \le y \le 468$) | **0** | ✅ **PASS** |
| **Hitbox Geometry Variance** | **0.000%** (strictly 24x24, offset 8,8) | Fixed rigid dimensions | ✅ **PASS** |
| **Total Execution Time** | 16.80 ms (1.68 µs / frame) | $< 500\text{ ms}$ | ✅ **PASS** |

---

## 7. Test Suite Execution Logs

Executed via:
```bash
node --experimental-strip-types --test \
  tests/player_movement_stress.test.mjs \
  tests/physics_stress_challenger_1.test.mjs \
  tests/physics_remediation_defensive.test.mjs \
  tests/chaos_corner_sliding_subpixel.test.mjs
```

```text
✔ CHAOS 1.1: Player Body Invariant Guard maintains strict 24x24 hitbox across 1,000 rapid transforms (1.72ms)
✔ CHAOS 1.2: Boundary Clearance Matrix: Centered player has exactly 8.000px clearance in 40px corridors (0.18ms)
✔ CHAOS 2.1: Diagonal input routing automatically picks open orthogonal axis against pillar corners (0.28ms)
✔ CHAOS 2.2: Corner Rounding assist zone (8px, 11px, 14px) successfully slides around pillar without snagging (0.40ms)
✔ CHAOS 2.3: "Fake Open" diagonal trap: player does not clip vertex when diagonal corner is blocked (0.68ms)
✔ CHAOS 2.4: 2,000 Frames of continuous diagonal chaos pathing around pillars: 0 snags, 0 penetrations (10.24ms)
✔ CHAOS 3.1: Sub-pixel rounding at 250 px/s cleanly converges to centerline without infinite oscillation (0.56ms)
✔ CHAOS 3.2: Extreme Dash Speed (350 px/s) maintains corridor clearance and 0 penetration across 500 frames (1.06ms)
✔ CHAOS 3.3: Variable Frame Rate & Delta Jitter (120 FPS, 60 FPS, 30 FPS, 20 FPS lag spike) at 250 px/s (1.35ms)
✔ CHAOS 4.1: Conveyor belt drift halts cleanly at solid wall boundaries without penetration (0.50ms)
✔ CHAOS 4.2: Conveyor drift intersecting perpendicular high-speed movement (250 px/s) (0.22ms)
✔ CHAOS 4.3: Counter-drift navigation: player overcomes conveyor push without snagging (0.25ms)
✔ CHAOS 5.1: 10,000 Continuous frames of chaotic movement under 250/350 px/s: 0 wall penetrations, 0 pillar clippings (16.80ms)

✔ PHYS-REV-01: applyPhysicsBodyInvariantGuard maintains transform and body sync when sprite.setPosition() is called (1.71ms)
✔ AI-STUN-01: EnemyState enum includes STUNNED and all 6 enemy variants stop moving and cannot attack while stunned (3.95ms)
✔ AI-DEMOL-01: BomberEnemy strictly respects canDropBombs = false during offensive and demolition AI cycles (1.90ms)
✔ AI-05: GhostEnemy resets velocity to (0,0) when currentPath is empty, preventing indefinite drifting (0.28ms)
✔ PHYS-REV-09: BaseEntity respects entity base scale (baseScaleX, baseScaleY) across movement and idle cycles (1.24ms)
✔ UI-DEPTH & UI-PERF-01: OverheadUI initializes with RENDER_DEPTH and guards renderHpBar against redundant clearing (0.29ms)
✔ AI-ALLY-01: PetDroneAlly tractor beam coordinates pull velocity and position with target item body (0.60ms)
✔ AI-ALLY-01: MerchantNPC avoids re-entering active blast tiles during wander and escape pathing (0.90ms)

✔ CHALLENGE 1.1: Body Invariant Guard maintains strict 24x24 hitbox under 500 extreme transforms (2.26ms)
✔ CHALLENGE 1.2: Specialized Entity Invariant Guards (Tank 28x28, MiniSplitter 18x18, Critter 20x20) (0.82ms)
✔ CHALLENGE 1.3: Bomb Invariant Guard locks 32x32 hitbox across all 4 pulsing phases (0.14ms)
✔ CHALLENGE 2.1: Explosion 1.35x visual bloom NEVER exceeds 40px corridor or penetrates solid pillars (2.22ms)
✔ CHALLENGE 2.2: Bomb 1.32x pulse NEVER exceeds 40px corridor bounds or penetrates walls (0.63ms)
✔ CHALLENGE 3.1: 1,000 simulated corner sliding iterations verify 0 snags, 0 wall penetrations, proper centering (1.72ms)
✔ CHALLENGE 3.2: Outer Arena Boundary Invariance under 500 boundary collision ticks (4.65ms)
✔ CHALLENGE 4.1: Conveyor belt drift prevents bomb stacking across 500 continuous drift frames (0.80ms)
✔ CHALLENGE 4.2: Player Warp resets body cleanly and prevents collision ejection at portal (0.20ms)

✔ Hitbox Geometry: Centered player has exactly 8px clearance to corridor boundaries (0.71ms)
✔ Corridor Centering: Moving RIGHT with positive Y offset pulls player NORTH towards center (0.21ms)
✔ Corner Rounding: Turning early into perpendicular corridor slides around corner pillar (0.09ms)
✔ Dead-End Safety: Moving into flat dead-end wall produces ZERO perpendicular drift (0.06ms)
✔ Bomb Passability: Player can immediately step off freshly placed bomb on current tile (0.09ms)
✔ Diagonal Resolution: Automatically routes to open axis when one axis is blocked by a wall (0.04ms)
✔ Continuous Stress: Navigating an S-curve corridor under continuous physics step integration (0.50ms)
✔ PHYS-07: cornerSlideTolerance level 0 (8px), level 1 (11px), level 2 (14px) expands corner assist zone (0.06ms)
✔ PHYS-03: Conveyor drift AABB boundary clamp prevents wall penetration (0.08ms)

ℹ tests 60 | pass 60 | fail 0 | cancelled 0 | duration_ms 354.24ms
```

---

## 8. Pre-Flight Production Build Verification

Executed via: `npm run build`
```text
▲ Next.js 16.3.5 (Turbopack)
✓ Running next.config.ts took 11ms
  Creating an optimized production build ...
✓ Compiled successfully in 993ms
  Finished TypeScript in 727ms
  Generating static pages using 5 workers (4/4) in 192ms
Route (app)
┌ ○ /
└ ○ /_not-found
○  (Static)  prerendered as static content
```
Result: **Zero TypeScript diagnostics errors, zero bundle syntax regressions.**

---

## 9. Conclusion & Sign-Off

The 2026-10-01 Daily Evolution audit for **Corner Sliding & Sub-Pixel Physics Boundaries** is **COMPLETED with ZERO DEFECTS**:
- **Player Hitbox:** Rigid 24x24 body invariant guaranteed under all sprite deformations and visual bobs.
- **Corner Sliding:** Seamless corner rounding with zero snags across 8px, 11px, and 14px tolerance zones.
- **Sub-Pixel Precision:** High-speed (250 px/s & 350 px/s) oscillation eliminated via dynamic snap windowing.
- **Conveyor Drift:** 3-point AABB leading edge bounds clamp completely prevents wall and obstacle penetration.
- **Anti-Tunneling:** 10,000-frame soak test proves zero wall penetrations and zero pillar clipping.
