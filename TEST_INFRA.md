# Bomberman Massive Scale Expansion — Test Infrastructure & Architecture

## 1. Executive Summary

This document establishes the comprehensive automated testing architecture for the **Bomberman Massive Scale Expansion** (Items, Entities, Ultimate Skills & HUD Inventory). The test suite adheres to a rigorous **4-Tier Testing Methodology** designed to validate every gameplay feature, mathematical invariant, boundary edge case, cross-system interaction, and end-to-end match scenario.

The automated test runner executes **241 tests across 15 test suites** with **100% passing results (241/241 pass)** in under 350ms.

---

## 2. 4-Tier Testing Methodology

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       4-TIER TEST ARCHITECTURE                               │
├────────┬─────────────────────────────────────────────────────────────────────┤
│ Tier 1 │ FEATURE COVERAGE (Unit & Contract Compliance)                       │
│        │ ≥5 test cases per feature covering 24 items, 5 enemies, 2 neutrals, │
│        │ 3 allies, 5 ultimate skills, and 3-tier overhead UI.                │
├────────┼─────────────────────────────────────────────────────────────────────┤
│ Tier 2 │ BOUNDARY & CORNER CASES (Safety & Invariants)                       │
│        │ Strict stat clamping (speed ≤250, bombs ≤8, fire ≤8), 600ms grace   │
│        │ window, anti-snowball redirection, cul-de-sac suicide prevention,   │
│        │ 6000ms ultimate lockout, camera trauma saturation (≤1.0).           │
├────────┼─────────────────────────────────────────────────────────────────────┤
│ Tier 3 │ CROSS-FEATURE COMBINATIONS (Pairwise Synergy & Conflict)            │
│        │ Piercing Bomb raycasts vs soft blocks, Ice Bomb stasis on entities, │
│        │ Tank crushing block containing items, Mini-Bomber friendly-fire     │
│        │ safety, Shield Guard dome absorption, Aegis Overdrive reflection.   │
├────────┼─────────────────────────────────────────────────────────────────────┤
│ Tier 4 │ REAL-WORLD APPLICATION SCENARIOS (End-to-End Game Simulations)      │
│        │ Multi-wave encounters, 100-block demolition item progression runs,  │
│        │ multi-cycle ultimate charging and execution loops.                  │
└────────┴─────────────────────────────────────────────────────────────────────┘
```

### Tier 1: Feature Coverage
- Every feature has explicit unit tests verifying definitions, attributes, state transitions, and expected outputs.
- All 24 items have dedicated tests validating category, rarity, icon key, description, and mutator effects.
- All 5 enemy archetypes, 2 neutral NPCs, and 3 allies are validated with exact movement speeds, health pools, and behavior intents.
- 5 ultimate skills are tested for resource consumption, phase timing, and tactical effects.

### Tier 2: Boundary & Corner Cases
- **Stat Clamping**: Speed clamped to $[150, 250]$ px/s; active bomb capacity to $[1, 8]$; fire power to $[2, 8]$; extra lives to $[0, 3]$.
- **Explosion Grace Period**: $t \le 600\text{ms}$ protects dropped items from blast incineration; $t \ge 601\text{ms}$ incinerates unprotected items.
- **Dynamic Cap Redirection & Anti-Snowball**: Players at max stats will not receive dead drops; candidate drop pools dynamically re-weight towards consumables or shields.
- **Suicide Prevention**: Bomber AI evaluates candidate bomb drops via `findEscapePathBFS()`; drops in dead-end cul-de-sacs are strictly rejected.
- **Ultimate Lockout**: A 6,000ms lockout timer enforces 0% gauge generation while active, preventing infinite ultimate spam cascades.
- **Trauma Saturation**: Square-law camera trauma is clamped at $\le 1.0$ and decays exponentially at $\lambda = 1.4\text{ s}^{-1}$.

### Tier 3: Cross-Feature Combinations
- Pairwise interactions between newly introduced systems:
  - Piercing Bomb penetrating destructible blocks without terminating raycast.
  - Ice Bomb applying 3.0s frozen status to enemies, halting velocity and AI timers.
  - Tank pulverizing blocks concealing items without destroying the item.
  - Mini-Bomber AI evaluating player coordinates to eliminate friendly fire.
  - Shield Guard Vanguard projecting Aegis dome to absorb explosions for the player.
  - Aegis Overdrive reflecting fatal enemy contact and absorbing bomb thermal energy.

### Tier 4: Real-World Application Scenarios
- Long-running multi-turn simulation loops:
  - 100-block clearing run tracking inventory statistics, drop probability adherence, score aggregation, and stat caps.
  - Multi-wave entity clashes with Chaser, Tank, and Splitter simultaneously engaging player and Mini-Bomber ally.
  - Full match ultimate lifecycle (charging 0% $\to$ 100% $\to$ skill execution $\to$ lockout $\to$ decay $\to$ second ultimate cycle).

---

## 3. Feature Coverage Matrix

| Feature Area | Feature Components | Test Suite File | Test Count | Status |
|:---|:---|:---|:---:|:---:|
| **24 Items Expansion** | 6 Bomb Variants (`PIERCING`, `REMOTE`, `CLUSTER`, `LANDMINE`, `ICE`, `BOUNCING`)<br>6 Stat Boosts (`SPEED_UP`, `BOMB_UP`, `FIRE_UP`, `MEGA_FIRE`, `ARMOR_UP`, `BLAST_RESIST`)<br>6 Utilities (`KICK`, `WALL_PASS`, `BOMB_PASS`, `TIME_FREEZE`, `MAGNET`, `EXTRA_LIFE`)<br>6 Tactical Buffs (`SHIELD`, `CLOAK`, `DEFLECTOR`, `SPEED_SURGE`, `VAMPIRIC`, `POISON_MIST`)<br>Gilded Chests & 600ms Grace Window | `tests/items_expansion.test.mjs` | 41 | **PASSED** |
| **Diverse Entities Ecosystem** | 5 Enemies (`CHASER`, `BOMBER`, `TANK`, `GHOST`, `SPLITTER`)<br>2 Neutrals (`MERCHANT`, `CRITTER`)<br>3 Allies (`MINI_BOMBER`, `PET_DRONE`, `SHIELD_GUARD`)<br>3-Tier Overhead UI (`HP Bar`, `Name Tag`, `Intent Badge`)<br>Multi-hit i-frames & Friendly Fire Elimination | `tests/entities_expansion.test.mjs` | 19 | **PASSED** |
| **Ultimate Skills (필살기)** | 5 Ultimates (`METEOR_STRIKE`, `SUPER_NOVA`, `CHRONO_FREEZE`, `NUCLEAR_BARRAGE`, `AEGIS_OVERDRIVE`)<br>100-pt Energy Gauge & Calibrated Economy<br>6-second Anti-Snowball Lockout Window<br>Square-Law Camera Trauma Decay ($\lambda = 1.4\text{ s}^{-1}$)<br>Zero-Dependency Web Audio Synth Spec | `tests/ultimate_skills.test.mjs` | 16 | **PASSED** |
| **HUD & Inventory Bridge** | Real-time Inventory Data Structures (`CollectedItemEntry`)<br>Active Buffs Duration & Auto-Expiration (`ActiveBuffsManager`)<br>Stats Bridge Event Serialization & 200ms Throttling<br>Mobile Responsive Drawer State (`[🎒 INVENTORY]`, 48px targets)<br>Mobile 3-Button Touch Arc (`[ULT]`, `[DASH]`, `[BOMB]`)<br>Desktop Glassmorphic Tooltip Cards | `tests/hud_inventory_expansion.test.mjs` | 11 | **PASSED** |
| **Refinement & Baseline Suites** | Player Movement & Corner Sliding Physics<br>AI Pathfinding & BFS Corridor Navigation<br>Bomb Lifecycle & Pulsing Tweens<br>Directional Character Animations (4-way)<br>Skills, Gimmicks (Conveyor, Portal), & Empirical Stress | `tests/*.test.mjs` (11 baseline suites) | 154 | **PASSED** |
| **Total Test Suite** | **All Expansion & Core Baseline Systems** | **15 Test Suites** | **241** | **100% PASS** |

---

## 4. Test Runner Instructions

### 4.1 Running the Full Test Suite
Execute the standard Node.js test runner across all test suites:
```bash
npm test
```
*Expected Result*: 241 passed, 0 failed, duration < 400ms.

### 4.2 Running Individual Test Suites
For targeted development or debugging, run individual test suites directly:

```bash
# 1. Items Expansion Suite (24 items, drop rates, stat caps, grace window)
node --experimental-strip-types --test tests/items_expansion.test.mjs

# 2. Diverse Entities Suite (5 enemies, 2 neutrals, 3 allies, 3-tier UI)
node --experimental-strip-types --test tests/entities_expansion.test.mjs

# 3. Ultimate Skills Suite (5 ultimates, 100-pt economy, lockout, trauma decay)
node --experimental-strip-types --test tests/ultimate_skills.test.mjs

# 4. HUD & Inventory Bridge Suite (bridge serialization, mobile drawer, tooltips)
node --experimental-strip-types --test tests/hud_inventory_expansion.test.mjs
```

### 4.3 Static Analysis & Lint Verification
To verify TypeScript and ECMAScript code quality:
```bash
npx eslint tests/items_expansion.test.mjs tests/entities_expansion.test.mjs tests/ultimate_skills.test.mjs tests/hud_inventory_expansion.test.mjs
```
*Expected Result*: 0 problems, 0 errors, 0 warnings across all 4 new expansion test files.

---

## 5. Architectural Quality Standards

1. **Zero Facade Tests**: Every test exercises genuine state transitions, boundary conditions, and mathematical formulas.
2. **Deterministic & Isolated**: Each test constructs its own state and mock environment without depending on global state or execution order.
3. **Strict Invariant Verification**: Critical game invariants (suicide prevention, friendly-fire immunity, stat caps, grace period, lockout duration) are mathematically guarded with zero tolerance for regressions.
