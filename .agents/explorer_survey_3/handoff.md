# Handoff Report: Test Suites, Builds, and Resilience Infrastructure

**Agent**: Survey Explorer 3  
**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_survey_3`  
**Date**: 2026-09-17  
**Recipient**: Parent Orchestrator (`orchestrator_evolution`, Conversation ID: `ab854808-7888-423e-8abb-01693016a769`)

---

## 1. Observation

1. **Test Runner & Execution**:
   - `package.json` line 10 specifies: `"test": "node --experimental-strip-types --test tests/*.test.mjs"`.
   - Running `npm test` executed 280 tests across 17 test suites with 0 failures, 0 skipped, in 164.38ms on Node v25.8.1.
   - Verbatim warning encountered:
     ```
     (node:34162) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/user/src/bomberman/src/game/gameplay_mechanics.ts is not specified and it doesn't parse as CommonJS.
     Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
     To eliminate this warning, add "type": "module" to /Users/user/src/bomberman/package.json.
     ```
   - Running `npm run lint` exited code 0 with 26 unused variable warnings in `tests/empirical_challenge_stress.test.mjs` and `tests/skills_gimmicks_hud_stress.test.mjs`, 0 errors.
   - Running `npm run build` compiled Next.js 16.3.5 with Turbopack in ~1.5s, successfully generating static routes for `/` and `/_not-found`.

2. **State Management & Persistence**:
   - `grep_search` across `src/` for `localStorage`, `sessionStorage`, `save`, and `quota` returned zero instances of persistence.
   - In `src/components/BombermanGame.tsx`:
     - Line 40: `const [stats, setStats] = useState<PlayerStats>(createInitialPlayerStats());` (React state).
     - Lines 191-196: Phaser event bridge updates React via `phaserGame.events.on('stats-update', handleStatsUpdate)`.
     - Lines 202-208: On component unmount, `phaserGameRef.current.destroy(true)` destroys the scene and all entities without serialization.
   - In `src/game/GameScene.ts`:
     - Lines 1080-1510: Map array `this.map: number[][]`, physics groups `this.bombs`, `this.blocks`, `this.items`, `this.enemies`, `this.allies`, `this.neutrals` are held in volatile heap memory.
     - No export/import serialization method exists.

3. **Garbage Collection Churn Hotspots in 60 FPS Loop**:
   - `src/game/ultimate_skills.ts:196`: `CameraTraumaSimulator.getOffsets()` executes `return { x, y, angle };` on every tick, causing 60 allocations per second (10,000 allocations in a 10k-frame soak).
   - `src/game/GameScene.ts:1745-1753`: Inside `update()`, `const bombTiles = new Set<string>();` and `bombTiles.add(`${row},${col}`);` allocate a new Set and string templates 60 times/sec.
   - `src/game/GameScene.ts:1818-1821`: `this.enemies.getChildren().filter(...)` and `this.items.getChildren().filter(...)` allocate new arrays on every frame.
   - `src/game/GameScene.ts:2240, 2272, 2340, 2399, 2926, 3107, 3132`: Bombs, explosions, shockwave graphics, debris rectangles, dash ghost sprites, and floating text are created dynamically and destroyed via `.destroy()`, causing severe object churn.

4. **Absence of Headless Soak & Chaos Testing**:
   - The test directory contains 17 `.test.mjs` files covering unit mechanics, pathfinding, and ultimate economy, but lacks:
     - A 10,000-frame continuous game loop soak harness tracking V8 heap drift.
     - An autonomous Chaos Bot stressing multi-touch, rapid pause/unpause, and physical boundary clipping.

---

## 2. Logic Chain

1. From Observation 1: The current runner (`node:test` + `--experimental-strip-types`) is exceptionally fast (<170ms) and requires zero third-party testing dependencies. Vitest or Jest would introduce substantial dependency weight without providing faster feedback. Therefore, `node:test` should be retained, with `--expose-gc` added for memory verification.
2. From Observation 2: Because neither `localStorage` nor `sessionStorage` is used, any page refresh, browser tab background eviction on mobile, or API 429 quota exhaustion completely resets player state. To satisfy the prompt's requirement for 429 quota recovery and state resilience, a dual-tier persistence system (`sessionStorage` for active match + `localStorage` for meta-progression) with an API circuit breaker is required.
3. From Observation 3: The per-frame allocations in `CameraTraumaSimulator.getOffsets()`, `update()` hazard sets, and dynamic GameObject creation/destruction will cause frequent V8 garbage collection pauses on mobile devices during a 10,000-frame run. Therefore, pre-allocated object pools (`ObjectPool<T>` for bombs, explosions, particles, text) and zero-allocation data structures (a flat `Uint8Array` for hazard tiles, mutable scratch vectors) must be implemented to achieve Zero-GC.
4. From Observation 4: Without a 10,000-frame soak harness and Chaos Bot, regressions in memory leaks and input race conditions cannot be detected prior to deployment. Hence, dedicated test suites (`tests/soak_10k_frames.test.mjs` and `tests/chaos_resilience.test.mjs`) must be established as permanent gates.

---

## 3. Caveats

- **Phaser Headless Execution**: Direct instantiation of `Phaser.Game` in Node.js throws `ReferenceError: window is not defined`. All existing unit tests successfully circumvent this by testing pure simulation models (`EntitySimulator`, `UltimateEngineSimulator`, `pathfinding.ts`, `gameplay_mechanics.ts`). The 10,000-frame soak harness and Chaos bot must follow this proven architectural pattern by using a headless game loop simulation (`HeadlessGameSimulation`) that tests the complete game rules and pooled entities without WebGL/DOM dependencies.
- **Node Type Module Configuration**: Adding `"type": "module"` to `package.json` eliminates the typeless module warning, but should be tested against Next.js build scripts to confirm total compatibility before applying.

---

## 4. Conclusion

The Bomberman codebase is well-tested and builds cleanly, but requires three structural infrastructure additions to fulfill the infinite evolution requirements:
1. **Zero-GC Object Pooling**: Replace dynamic instantiation/destruction of bombs, explosions, debris, and floating text with pre-allocated pools, and eliminate per-frame allocations in `getOffsets()` and `update()`.
2. **Dual-Tier State Persistence & 429 Recovery**: Implement `GameStatePersistence.ts` with serialized match snapshots and an exponential backoff circuit breaker for API 429 quota limits.
3. **10k-Frame Soak & Chaos Bot Test Suites**: Implement `tests/soak_10k_frames.test.mjs` (verifying $<250\text{ KB}$ heap growth over 9,000 steady frames) and `tests/chaos_resilience.test.mjs` (verifying physical and gauge invariants under 50,000 adversarial input vectors).

---

## 5. Verification Method

1. **Verify Test Runner**:
   ```bash
   cd /Users/user/src/bomberman
   npm test
   ```
   *Expected Result*: 280 tests pass, 0 fail, runtime < 400ms.

2. **Verify Code Quality & Build**:
   ```bash
   npm run lint
   npm run build
   ```
   *Expected Result*: Lint exits 0 (warnings only), build completes successfully with static pages prerendered.

3. **Verify Survey Report Artifact**:
   Inspect `/Users/user/src/bomberman/.agents/explorer_survey_3/report.md` for complete technical designs, code snippets, and architectural diagrams.

4. **Invalidation Conditions**:
   - Any test failures in `npm test`.
   - Build failures in `npm run build`.
   - Continued allocation of objects inside per-frame update loops without pooling.
