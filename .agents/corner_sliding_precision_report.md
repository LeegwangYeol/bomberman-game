# Subpixel Corner Sliding & High-Velocity Physics Precision Verification Report

**Date**: 2026-10-02 / 2026-10-03  
**Status**: ✅ **VERIFIED (100% Pass: 73/73 Tests across all suites)**  
**Target Code**: `src/game/GameScene.ts`, `src/game/entities/BaseEntity.ts`, `src/game/entities/EnemyEntities.ts`  
**Test Suites**:
- `tests/corner_sliding_precision.test.mjs` (9/9 pass)
- `tests/high_velocity_corner_sliding.test.mjs` (8/8 pass)
- `tests/corner_sliding.test.mjs` (13/13 pass)
- `tests/chaos_corner_sliding_subpixel.test.mjs` (13/13 pass)
- `tests/player_movement_stress.test.mjs` (30/30 pass)

---

## 1. Summary of Physics Precision Guarantees

### 1.1 Invariant Hitbox Clearance ($24 \times 24$ px Rigid Body in $40 \times 40$ px Tile)
- Corridor tile size: $T = 40\text{ px}$.
- Player/Entity rigid body: $B = 24\text{ px}$ with offset $(8, 8)\text{ px}$.
- Centered clearance: exactly $\frac{40 - 24}{2} = 8.000000\text{ px}$ on all four cardinal sides.
- Invariant Guard: `applyPhysicsBodyInvariantGuard` preserves rigid body size $(24, 24)$ and relative offset $(-12, -12)$ regardless of visual animations, squash/stretch scales ($0.5\times$ to $2.0\times$), or sprite flips.

### 1.2 Mathematical Formulation of Dynamic Snap Window
At baseline velocity ($v = 150\text{ px/s}$), per-frame displacement is $\Delta x = 2.5\text{ px}$.
At high velocity (**Speed Up Lv. 5: $250\text{ px/s}$**): $\Delta x = 4.167\text{ px}$.
At dash velocity (**Dash Speed: $350\text{ px/s}$**): $\Delta x = 5.833\text{ px}$.
At compound surge (**Dash + Speed Surge: $425\text{ px/s}$**): $\Delta x = 7.083\text{ px}$.

Under static $2\text{px}$ snap threshold, high displacements step over the $[-2, +2]\text{px}$ window, causing subpixel high-frequency oscillation (jitter).

**Solution implemented in `src/game/GameScene.ts`**:
$$\text{snapThreshold}(v, \Delta t) = \max\left(2.0, v \cdot \Delta t\right)$$
- Snap window width: $W = 2 \cdot \text{snapThreshold} \ge 2 (v \cdot \Delta t) > \Delta x$.
- **Convergence Proof**: Step displacement is bounded by $W / 2$, so a player cannot overshoot or skip the snap window. Any offset converges to the centerline in $\le 2$ ticks with at most 1 sign transition.
- **Physical Sync Enhancement**: When snapping to `rowCenterY` or `colCenterX`, the Arcade Physics body is immediately synchronized via `updateFromGameObject()`, preventing 1-frame subpixel lag.

### 1.3 Corner Rounding Assistance & Tolerance Progression
When approaching a blocked tile with open perpendicular corridors:
$$\text{canRound} \iff |\text{diff}| \le \text{tolerance} \land \text{isPassable}(\text{target tiles})$$
- **Base**: $8\text{ px}$ tolerance (exact clearance width).
- **Perk Lv. 1 (Corner Magnet)**: $11\text{ px}$ tolerance.
- **Perk Lv. 2 (Corner Magnet)**: $14\text{ px}$ tolerance.
- **Boundary Verification**: Offset at $\text{tol} - 0.001\text{ px}$ immediately triggers perpendicular assist velocity ($|v_\perp| = \text{slideSpeed}$); offset at $\text{tol} + 0.001\text{ px}$ produces zero ghost slide.
- **Zero Dead-Zone**: When player is exactly centered ($\text{diff} = 0.000\text{ px}$) against a pillar corner, assist smoothly activates with a deterministic tie-breaker rather than stalling.

---

## 2. Empirical Verification Results

| Test ID | Scope | Velocity / Conditions | Observed Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **PREC-01** | Hitbox & clearance geometry | $60\text{ px}$ center, $40\text{ px}$ walls | Exactly $8.000000\text{ px}$ clearance | ✅ PASS |
| **PREC-02** | 300 Subpixel offset sweep | $250\text{ px/s}$, $[-7.5, +7.5]\text{ px}$ | $\le 2$ ticks convergence, $\le 1$ sign switch | ✅ PASS |
| **PREC-03** | 300 Subpixel offset sweep | $350\text{ px/s}$ Dash, $[-7.5, +7.5]\text{ px}$ | 0 infinite jitter, clean snap | ✅ PASS |
| **PREC-04** | Irrational offsets ($\pi/4, \sqrt{2}, e/2, \phi$) | $250\text{ px/s}$, subpixel floating point | Snapped to exact 60.0 on tick 1 | ✅ PASS |
| **PREC-05** | Dynamic window scaling proof | $v \in [50, 425]$, $\text{FPS} \in [20, 120]$ | $W \ge 2\Delta x$ verified across matrix | ✅ PASS |
| **PREC-06** | Tolerance boundaries (8, 11, 14px) | Subpixel threshold ($\pm 0.001\text{px}$) | Strict assist activation within boundary | ✅ PASS |
| **PREC-07** | Zero dead-zone at corner pillar | $\text{diff} = 0.000\text{ px}$ | Valid non-zero assist, zero stall | ✅ PASS |
| **PREC-08** | Quadrant symmetry | N, S, E, W cardinal directions | Symmetric convergence across all 4 axes | ✅ PASS |
| **PREC-09** | Continuous noise stress | 2,000 frames random micro-offsets | Zero positioning error accumulation | ✅ PASS |
| **HIGHVEL-01** | Solid pillar corner rounding | $250\text{ px/s}$, NE/SE/NW/SW approaches | 0.000 px penetration, clean turns | ✅ PASS |
| **HIGHVEL-02** | Dash speed corner rounding | $350\text{ px/s}$ Dash | 0 wall clipping, full velocity retained | ✅ PASS |
| **HIGHVEL-03** | Compound speed corner rounding | $425\text{ px/s}$ (Dash + Speed Surge) | 0 penetration, smooth corridor transit | ✅ PASS |
| **HIGHVEL-04** | Continuous multi-lap circuit | 20 corners at $250$ & $350\text{ px/s}$ | Pillar clearance $\ge 0.000\text{ px}$ throughout | ✅ PASS |
| **HIGHVEL-05** | Variable delta / lag spikes | 120, 60, 30, and 15 FPS ($66.7\text{ms}$) | 0 wall tunneling or penetration | ✅ PASS |
| **HIGHVEL-06** | Chicane / S-bend navigation | $350\text{ px/s}$ through multi-turn chicane | Smooth corner turns without stopping | ✅ PASS |
| **HIGHVEL-07** | Entity invariant clearance | Chaser ($240\text{ px/s}$), Ghost ($260\text{ px/s}$) | Rigid $24\times 24$ box, $8\text{px}$ margin | ✅ PASS |
| **HIGHVEL-08** | 10,000-Frame Soak | Alternating $250$ / $350\text{ px/s}$ in full arena | 0 wall penetrations across 10,000 frames | ✅ PASS |

---

## 3. Production Build & Lint Verification
- **Build Verification**: `npm run build` executed successfully (Next.js 16.3.5 / Turbopack). TypeScript compilation completed with 0 errors.
- **Suite Execution**: All 73 tests passed in $239.38\text{ms}$.
