# Scout 5: Test Execution, Flakiness & Coverage Matrix

**Division:** Scout & Context Division  
**Mission:** Dynamic Test Suite Profiling, Timing Analysis, Flakiness Root-Cause Detection & Test Coverage Mapping  
**Date:** 2026-09-30  
**Environment:** macOS | Node.js v25.8.1 | Phaser 4.2.1 | React 19.2.8 / Next.js 16.3.5  

---

## 1. Executive Summary & Health Dashboard

| Metric | Measured Value | Notes / Assessment |
| :--- | :--- | :--- |
| **Total Test Suites** | **51 files** (48 existing + 3 in-flight) | 48 in `tests/`, 3 in `tests/unit/` |
| **Total Tests Tracked** | **743 tests** | 711 passing in baseline; 8 active failures in new suites |
| **Serial Execution Time** | **22.5s** | Total time when executed sequentially file-by-file |
| **Parallel Execution Time** | **4.74s** (`npm test`) | Node.js native test runner running across worker pool |
| **Active Test Failures** | **8 failures** | In `tests/dynamic_hazard.test.mjs` (6) and `tests/fuzz_buff_stacking.test.mjs` (2) |
| **Flaky Benchmark Tests** | **5 tests** identified | Vulnerable to CPU throttling, parallel test runner load, and ambient V8 heap growth |
| **Test Coverage Gaps** | **3 completely untested**, **8 lightly tested** | `BossAttackManager.ts`, `input_state.ts`, and `BombermanGame.tsx` have largest gaps |

---

## 2. Benchmark Timing & Flakiness Analysis

Under concurrent execution via `npm test` (where Node spawns parallel worker processes), CPU load and V8 garbage collection create severe timing spikes that trigger false-positive assertion failures. 5 specific tests have been empirically identified as flaky:

### 2.1. `tests/challenger_m2_bubble_cascade_depth.test.mjs` — Test 2.9
- **Test Name:** `Challenger 2.9 [Floating Text]: 10,000 rapid calls benchmark completes in < 30ms with 0 NaN`
- **Assertion:** `assert.ok(duration < 30, ...)`
- **Isolated Run:** 0.57ms – 2.47ms
- **Parallel Run Under Load:** **49.13ms (FAILED)**
- **Root Cause:**
  1. The test executes 10,000 iterations and performs **2 assertions per loop** (`assert.ok(!Number.isNaN(offset))` and `assert.ok(offset >= 0)`), totaling 20,000 assertion calls within the timed `performance.now()` block.
  2. In `FloatingTextManager.getCascadeOffset`, each call scans `this.size` elements (up to `MAX_POOL = 1024`) with modulo index calculations.
  3. When 48 test processes execute concurrently, V8 JIT tier-up delays and thread scheduling push wall-clock time from ~2ms to ~49ms, breaching the rigid 30ms limit.
- **Recommended Remediation:**
  - Move assertions outside the timed performance loop (verify invariants on samples or post-loop).
  - Warm up the JIT loop with 500 iterations before starting `performance.now()`.
  - Relax budget to `< 75ms` under CI/parallel flags, or assert average time per call `< 10µs` instead of wall-clock total.

### 2.2. `tests/empirical_challenge_stress.test.mjs` — Challenger 2.1
- **Test Name:** `Challenger 2.1: Extreme Arena Congestion — 20 simultaneous bombs with overlapping danger zones`
- **Assertion:** `assert.ok(elapsed < 5, ...)`
- **Isolated Run:** ~1.2ms
- **Parallel Run Under Load:** **12.10ms (FAILED)**
- **Root Cause:**
  - Measures `findEscapePathBFS` execution with 20 overlapping bomb danger areas using wall-clock `performance.now()`.
  - When CPU cores are saturated by adjacent suites (`soak_20k_extended` and `ui_depth_declutter`), thread preemption causes BFS elapsed time to spike past the 5ms threshold.
- **Recommended Remediation:**
  - Increase threshold to `< 20ms` or run 10 iterations and measure median time rather than a single cold-start iteration.

### 2.3. `tests/challenger_m2_overhead_stress.test.mjs` — Challenger M2
- **Test Name:** `Challenger M2 [Performance Scale]: 100 entities stress test still respects frame budget (< 1.5ms)`
- **Assertion:** `assert.ok(avgTime < 1.5, ...)`
- **Isolated Run:** ~0.42ms / frame
- **Parallel Run Under Load:** **1.57ms / frame (FAILED: 313.96ms for 200 iterations)**
- **Root Cause:**
  - 100 mock entities updated for 200 iterations inside `manager.update(entities, player, 16, false)`.
  - Under parallel load, per-frame average exceeds 1.5ms by 0.07ms.
- **Recommended Remediation:**
  - Scale threshold to `< 2.5ms` to account for CPU context switching during multi-threaded test runs.

### 2.4. `tests/adversarial_demolition_hunting.test.mjs` — Suite 5.4
- **Test Name:** `Suite 5.4: 10,000 Iteration Zero-GC High-Throughput Soak Test`
- **Assertion:** `assert.ok(heapDeltaMb <= 1.0, ...)`
- **Isolated Run:** 0.12 MB drift
- **Parallel Run Under Load:** **1.09 MB drift (FAILED)**
- **Root Cause:**
  - The test checks `global.gc ? global.gc() : null`, but Node runs without `--expose-gc` by default in `npm test`.
  - Ambient memory allocations from Node's internal test runner events and module resolution push `process.memoryUsage().heapUsed` up by 1.09 MB, failing the 1.0 MB ceiling.
- **Recommended Remediation:**
  - Add conditional check: `if (typeof global.gc === 'function') { assert.ok(heapDeltaMb <= 1.0); } else { assert.ok(heapDeltaMb <= 5.0); }` (aligning with `challenger_m3_movement_soak.test.mjs`).

### 2.5. `tests/challenger_m3_movement_soak.test.mjs` — Challenger M3
- **Test Name:** `Challenger M3 [Grand Soak]: 10,000-Frame Soak Test maintains Heap Drift <= 0.25MB`
- **Assertion:** Ambient GC mode checks `assert.ok(netHeapDriftMB <= 5.0, ...)`
- **Isolated Run:** ~1.4 MB drift
- **Parallel Run Under Load:** **5.32 MB drift (intermittent failure)**
- **Root Cause:**
  - Running 10,000 simulated frames alongside 47 other test files causes V8 to expand its heap pages dynamically, causing ambient heap delta to occasionally cross 5.0 MB.

---

## 3. Active Test Failures Deep Dive

Running the active/uncommitted test files revealed **8 deterministic test failures**:

### Suite A: `tests/dynamic_hazard.test.mjs` (6 Failures)
1. **Tier 3: Direct player hit inflicts 25 energy damage and Phase Jitter debuff**
   - Line 203: `assert.ok(hazard.isTileLethal(6, 5))` failed.
   - *Reason:* Hazard tile lethality status was false; hazard lifecycle timing in the test was in `TELEGRAPH` instead of `ACTIVE` state or coordinates were offset.
2. **Tier 3: Quantum Tunneling dash i-frames negate damage and grant Phase Shift**
   - Line 230: Expected `true`, received `false`.
   - *Reason:* Player dash state integration failed to activate `phaseShift` flag on `DynamicHazard`.
3. **Tier 4: Minion enemy in active beam is vaporized with 120 environmental damage**
   - Line 272: Expected `true`, received `false`.
   - *Reason:* Hazard beam collision callback did not return `isKilled = true` for minion entity.
4. **Tier 4: Boss enemy in active beam takes percentage damage and 1.5s stun**
   - Line 286: Expected `true`, received `false`.
   - *Reason:* Boss entity status effect was not applied by `applyHazardDamageToEnemy`.
5. **Tier 5: Tachyon Overcharge grants +2 blast power and piercing beam inside active hazard**
   - Line 343: Expected `true`, received `false`.
   - *Reason:* Bomb placement on active hazard tile failed to trigger tachyon overcharge modifier.
6. **Tier 5: Polarization Strike neutralizes lethal beam and purges surrounding tiles**
   - Line 372: Actual `'TELEGRAPH'`, Expected `'ACTIVE'`.
   - *Reason:* State machine did not transition from `TELEGRAPH` to `ACTIVE` before polarization strike triggered.

### Suite B: `tests/fuzz_buff_stacking.test.mjs` (2 Failures)
1. **Chaos QA 9: PerkTreeManager handles corrupt, negative, NaN, and Infinity perk states**
   - Line 66: `assert.ok(hasDashDecoy)` failed (`false !== true`).
   - *Reason:* `PerkTreeManager.prototype` checks for boolean flag; when initialized with truthy array `[1, 2, 3]`, truthiness resolution returned false.
2. **Chaos QA 9: Perk upgrade rejects negative, NaN, and non-numeric essence**
   - Line 90: Expected `false`, received `true`.
   - *Reason:* `unlockPerk` method did not validate that `essenceCost` is a positive finite number, allowing negative costs to pass successfully.

---

## 4. Test Suite Execution Profiling & Latency Ranking

### Top 15 Slowest Test Suites (Sequential Profiling)

| Rank | Suite Path | Duration | Test Count | Key Bottleneck |
| :---: | :--- | :---: | :---: | :--- |
| **1** | `tests/soak_20k_extended.test.mjs` | **2,908 ms** | 8 | 20,000 headless frame simulation loops |
| **2** | `tests/ui_depth_declutter.test.mjs` | **2,075 ms** | 22 | 1,000-entity depth sorting and declutter checks |
| **3** | `tests/m1_challenger_pathfinder_pool_stress.test.mjs` | **1,583 ms** | 7 | 100,000 randomized BFS queries & generational turnover |
| **4** | `tests/adversarial_suicide_zerogc.test.mjs` | **1,509 ms** | 6 | 15,000 high-load soak & dead-end cul-de-sac pathing |
| **5** | `tests/adversarial_challenge_inspection_2.test.mjs` | **1,137 ms** | 17 | Real wall-clock `setTimeout` delays in CircuitBreaker backoff |
| **6** | `tests/juice_game_feel.test.mjs` | **775 ms** | 16 | Animation curve calculations & particle lifecycle steps |
| **7** | `tests/aggressive_ai.test.mjs` | **654 ms** | 17 | Multi-stage demolition simulations across large grids |
| **8** | `tests/adversarial_physics_separation_suicide.test.mjs` | **592 ms** | 12 | 1,000 body-overlap physics separation iterations |
| **9** | `tests/ultimate_skills.test.mjs` | **538 ms** | 16 | Nuclear barrage & Chrono Freeze simulation steps |
| **10** | `tests/challenger_m2_overhead_stress.test.mjs` | **506 ms** | 15 | 100 mock entities over 500 frames |
| **11** | `tests/challenger_m2_bubble_cascade_depth.test.mjs` | **487 ms** | 13 | 10,000 cascade queue iterations & opacity lerp checks |
| **12** | `tests/challenger_m3_movement_soak.test.mjs` | **449 ms** | 4 | 10,000-frame juice & corner-slide soak |
| **13** | `tests/challenger_total_inspection_2_chaos.test.mjs` | **440 ms** | 18 | Chaos fuzzing of bomb placements and grid boundaries |
| **14** | `tests/scene_ui_defensive.test.mjs` | **416 ms** | 11 | GameScene DOM element detachment and HUD defense |
| **15** | `tests/systems_security_defensive.test.mjs` | **391 ms** | 10 | CircuitBreaker offline queue draining timers |

### Individual Tests Exceeding 50ms Execution Time

| Test Description | Suite | Time (ms) | Analysis |
| :--- | :--- | :---: | :--- |
| `Challenger 2.1b: CircuitBreaker non-429 retry rejects after 3 retries` | `adversarial_challenge_inspection_2` | **706.4 ms** | Waiting for real exponential backoff delay |
| `Challenger Aggressive Stress: 20k Frames Under Pool Load` | `soak_20k_extended` | **329.6 ms** | Large CPU soak loop (20k frames) |
| `Challenger 2.1: CircuitBreaker network chaos retry` | `adversarial_challenge_inspection_2` | **305.1 ms** | Real timer wait for retry window |
| `Challenger 1.7: ZeroGCPathfinder NaN infinite loop prevention` | `m1_challenger_pathfinder_pool_stress` | **186.0 ms** | 50,000 NaN/boundary coordinate path queries |
| `Challenger 1.1: ZeroGCPathfinder 100k randomized queries` | `m1_challenger_pathfinder_pool_stress` | **175.5 ms** | 100,000 query throughput test |
| `Adversarial 5: Extreme boundaries & power scaling` | `adversarial_suicide_zerogc` | **156.8 ms** | Fuzzing grid boundaries (-1000..1000) |
| `Adversarial Stress Suite 1: Enemy AI Demolition (120 Layouts)` | `adversarial_ai_demolition_100_layouts` | **123.2 ms** | 120 procedural map generations + BFS |
| `SEC-01: CircuitBreaker offline queue does not deadlock` | `persistence` | **101.6 ms** | Real timer delay (100ms) for retry window |
| `Challenger Component Soak: ObjectPool 20k-frame Drift` | `soak_20k_extended` | **67.5 ms** | 20k acquire/release cycles |
| `Adversarial 2: 15,000-call high-load Zero-GC soak` | `adversarial_suicide_zerogc` | **64.0 ms** | 15k path queries |
| `SEC-NET-02: CircuitBreaker auto-drains queued tasks` | `systems_security_defensive` | **52.5 ms** | Real timer wait for backoff auto-drain |

---

## 5. Test Coverage & Gap Analysis

### 5.1. Untested Source Files (Critical Coverage Gaps)

| Source File | Lines of Code | Description & Missing Test Coverage |
| :--- | :---: | :--- |
| `src/game/bosses/BossAttackManager.ts` | **256 LOC** | **0 matching test suites.** Manages 4 `ObjectPool` subsystems (`projectilePool`, `shockwavePool`, `minionPool`, `telegraphPool`). Zero unit tests validating projectile recycling, pool exhaustion, or shockwave timing. |
| `src/game/input_state.ts` | **132 LOC** | **0 matching test suites.** Provides centralized touch/joystick resolution, 8-way sector mapping, and double-RAF action dispatch. `tests/input_state.test.mjs` only tests an old mock function, completely ignoring this production file. |
| `src/app/page.tsx` | **22 LOC** | Next.js root landing page rendering `BombermanGame`. |

### 5.2. Lightly Tested Source Files (Under-Tested Subsystems)

| Source File | LOC | Current Test Suites | Missing Test Scenarios |
| :--- | :---: | :---: | :--- |
| `src/components/BombermanGame.tsx` | **1,988 LOC** | 2 suites | No React DOM testing for mobile joystick mount, inventory drawer toggle, sound mute button state, or canvas container resizing. |
| `src/game/bosses/BaseBoss.ts` | **443 LOC** | 2 suites | Dynamic enrage phase transitions under rapid multi-bomb explosions and edge cases around phase 3 health clamp. |
| `src/game/bosses/BossHUD.ts` | **338 LOC** | 2 suites | Rapid HUD health bar interpolation during multi-hit combos and phase break text display. |
| `src/game/entities/AllyEntities.ts` | **453 LOC** | 1 suite | MiniBomber demolition suicide prevention, Drone tractor beam pull physics on items, and Turret pulse repair rates. |
| `src/game/entities/NeutralEntities.ts` | **301 LOC** | 1 suite | Wandering Merchant item purchase transaction verification, Mimic attack transformation triggers. |
| `src/game/progression/RelicSystem.ts` | **498 LOC** | 1 suite | Synergistic stacking of multiple curse relics (e.g. glass cannon + explosive recoil) and inventory serialization. |
| `src/game/progression/GameModes.ts` | **355 LOC** | 1 suite | Endless Boss Rush floor scaling curves and Daily Challenge deterministic RNG seed stability. |
| `src/game/hazards/DynamicHazard.ts` | **839 LOC** | 1 suite | Currently has 6 failing tests; needs contract reconciliation between hazard state machine and unit test expectations. |

### 5.3. Well-Tested Core Subsystems (High Confidence)

| Subsystem | LOC | Suites | Key Validated Invariants |
| :--- | :---: | :---: | :--- |
| `src/game/pathfinding.ts` | 1,646 | **32 suites** | Zero-GC pre-allocated BFS, cul-de-sac escape, danger zone avoidance, NaN/boundary guards. |
| `src/game/GameScene.ts` | 4,580 | **17 suites** | Player movement, bomb placement, continuous depth sorting, bubble opacity decay, floating text cascade. |
| `src/game/persistence/*` | 1,275 | **10 suites** | CircuitBreaker 429 quota recovery, exponential backoff, checksum corruption rejection, profile sanitization. |
| `src/game/crises/*` | 1,680 | **7 suites** | Lava, Void, Orbital, Clockwork, Solar Flare lifecycle stages, hazard cleanup, SituationLog HUD. |
| `src/game/entities/EnemyEntities.ts` | 1,247 | **6 suites** | Chaser, Bomber, Blaster, Ghost, Tank AI state machines, suicide prevention, stun recovery. |
| `src/game/pooling/*` | 508 | **8 suites** | Contiguous typed array pools, swap-and-pop release, AudioVoicePool voice stealing and clean destroy. |

---

## 6. Actionable Recommendations for Swarm Agents

1. **Stabilize Flaky Benchmark Assertions:**
   - In `tests/challenger_m2_bubble_cascade_depth.test.mjs` (Line 466), remove assertions from the 10,000-iteration performance loop and raise budget from `< 30ms` to `< 75ms` to eliminate parallel CPU throttling flakiness.
   - In `tests/empirical_challenge_stress.test.mjs` (Line 281), adjust `elapsed < 5` to `elapsed < 20` or use multi-iteration averaging.
   - In `tests/challenger_m2_overhead_stress.test.mjs` (Line 448), adjust `avgTime < 1.5` to `< 2.5ms`.
   - In memory soak tests (`adversarial_demolition_hunting.test.mjs` and `challenger_m3_movement_soak.test.mjs`), apply conditional check for `global.gc` availability before asserting tight sub-1MB limits.

2. **Fix Active Test Failures:**
   - Resolve the 6 failing tests in `tests/dynamic_hazard.test.mjs` by ensuring the hazard state transitions to `ACTIVE` before calling `isTileLethal` and correcting damage/tunneling callbacks.
   - Fix `src/game/progression/PerkTree.ts` to reject negative/NaN essence in `unlockPerk` and properly handle array values in corrupt profile sanitization to resolve the 2 failures in `tests/fuzz_buff_stacking.test.mjs`.

3. **Close Immediate Coverage Gaps:**
   - Create a dedicated unit test suite `tests/unit/boss_attack_manager.test.mjs` to test `BossAttackManager.ts` (projectile pool, shockwaves, telegraph tiles).
   - Update `tests/input_state.test.mjs` to directly import and test all functions in `src/game/input_state.ts`.
