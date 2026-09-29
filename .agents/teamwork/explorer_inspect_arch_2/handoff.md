# Architecture & Systems Audit Report — Total Inspection (총검사)

**Auditor**: Architecture & Systems Auditor (`explorer_inspect_arch_2`)  
**Workspace**: `/Users/user/src/bomberman/.agents/teamwork/explorer_inspect_arch_2`  
**Date**: 2026-09-29  
**Quality Gate Status**: `npm test` PASS (644/644, 42 suites), `npm run lint` CLEAN (0 errors, 39 test warnings), `npm run build` PASS (Turbopack static prerender 765ms)

---

## 1. Observation

### 1.1 Path Discrepancy & Module Layout
- **Observed**: The dispatch instruction specifies nominal file paths `src/game/modes/ScalingEngine.ts`, `src/game/perks/PerkTreeManager.ts`, and `src/game/relics/RelicManager.ts`.
- **Actual Physical Locations**:
  - `ScalingEngine.ts` is located at `/Users/user/src/bomberman/src/game/progression/ScalingEngine.ts` (287 lines).
  - `GameModes.ts` is located at `/Users/user/src/bomberman/src/game/progression/GameModes.ts` (355 lines).
  - `PerkTreeManager` is located in `/Users/user/src/bomberman/src/game/progression/PerkTree.ts` (446 lines, class `PerkTreeManager` at line 229).
  - `RelicManager` is located in `/Users/user/src/bomberman/src/game/progression/RelicSystem.ts` (498 lines, class `RelicManager` at line 150).
  - `CrisisManager.ts` is located at `/Users/user/src/bomberman/src/game/crises/CrisisManager.ts` (214 lines).
  - `BaseCrisis.ts` is located at `/Users/user/src/bomberman/src/game/crises/BaseCrisis.ts` (394 lines).

---

### 1.2 Game Modes & Scaling Formulas (`ScalingEngine.ts` & `GameModes.ts`)
1. **Mathematical Formulas and Clamps (`ScalingEngine.ts`)**:
   - `calculateEnemySpeedMultiplier(wave)` (`ScalingEngine.ts:108-112`):
     ```ts
     const safeWave = this.sanitizeWave(wave);
     const bonus = Math.min(1.2, 0.035 * (safeWave - 1));
     return Number((1.0 + bonus).toFixed(4));
     ```
     Enforces a $2.20\times$ soft cap at wave 36+ ($1.0 + 1.2 = 2.2$).
   - `calculateActiveEnemyCount(wave)` (`ScalingEngine.ts:151-156`):
     ```ts
     const safeWave = this.sanitizeWave(wave);
     const delta = Math.sqrt(safeWave - 1) * 1.5;
     const count = 4 + Math.floor(delta);
     return Math.min(14, count);
     ```
     Strict cap at 14 active concurrent enemies (prevents object pool exhaustion and frame stutter).
   - `calculateEnemyHp(wave, baseHP)` (`ScalingEngine.ts:128-133`):
     ```ts
     const scaled = Math.floor(safeBase + 0.25 * (safeWave - 1));
     return Math.min(safeBase + 5, scaled);
     ```
     Enforces a soft cap of $\text{safeBase} + 5$.
   - `calculateBombFuseMs(wave)` (`ScalingEngine.ts:163-167`): Floor clamp of 1200ms (`Math.max(1200, 2000 - 40 * (safeWave - 1))`).
   - `calculateEnemyReactionMs(wave)` (`ScalingEngine.ts:172-176`): Floor clamp of 200ms (`Math.max(200, 600 - 20 * (safeWave - 1))`).
   - `calculateBossHp(wave, baseBossHp)` (`ScalingEngine.ts:194-199`): Soft cap at $\lfloor\text{safeBase} \times 2.5\rfloor$.
   - `sanitizeWave(wave)` (`ScalingEngine.ts:99-101`): Defensively sanitizes `NaN`, `-Infinity`, negative numbers, and decimals via `Number.isFinite(wave) ? Math.max(1, Math.floor(wave)) : 1`.

2. **CRITICAL DEFECT: Duplicate Wave Mutator Bug in `ScalingEngine.generateWaveMutators` (`ScalingEngine.ts:222-234`)**:
   - Source code snippet:
     ```ts
     // Pick second mutator that does not conflict
     let idx2 = (idx1 + 1 + (Math.abs(s >> 4) % (allKeys.length - 1))) % allKeys.length;
     let mutator2 = WAVE_MUTATOR_CATALOG[allKeys[idx2]];

     // Incompatible pairs check
     if (
       (mutator1.id === WaveMutatorId.GLASS_CANNON && mutator2.id === WaveMutatorId.DENSE_FORTIFICATION) ||
       (mutator1.id === WaveMutatorId.DENSE_FORTIFICATION && mutator2.id === WaveMutatorId.GLASS_CANNON)
     ) {
       idx2 = (idx2 + 1) % allKeys.length;
       mutator2 = WAVE_MUTATOR_CATALOG[allKeys[idx2]];
     }

     return [mutator1, mutator2];
     ```
   - In `WAVE_MUTATOR_CATALOG`, `allKeys` has 7 items: `DENSE_FORTIFICATION` is index 2, `GLASS_CANNON` is index 3.
   - When `idx1 = 3` (`GLASS_CANNON`) and `idx2 = 2` (`DENSE_FORTIFICATION`), the incompatible pair condition fires. Line 230 increments `idx2 = (2 + 1) % 7 = 3`.
   - `allKeys[3]` is `GLASS_CANNON`. Therefore, `mutator2 = GLASS_CANNON`, and line 234 returns `[GLASS_CANNON, GLASS_CANNON]`.
   - **Empirical Verification**:
     Running `node -e 'const { ScalingEngine } = require("./src/game/progression/ScalingEngine.ts"); console.log(ScalingEngine.generateWaveMutators(6, 80));'` outputs:
     `[ { id: 'GLASS_CANNON', ... }, { id: 'GLASS_CANNON', ... } ]`.
     Duplicate mutators occur at seeds 80, 87, 94, 178, 185, etc.

3. **DEFENSIVE GAP in `GameModes.determineChamberType` (`GameModes.ts:102-117`)**:
   - `const c = Math.max(1, Math.floor(chamberNumber));`
   - If `chamberNumber` is `NaN`, `Math.max(1, NaN)` returns `NaN`. `NaN % 5 === 0` is false, and it falls through without crashing to `ChamberType.STANDARD`, but lacks the explicit `Number.isFinite` sanitize guard used in `ScalingEngine`.

---

### 1.3 Crisis Manager & Stellaris-Style Events (`CrisisManager.ts` & `BaseCrisis.ts`)
1. **3-Stage Escalation & Hazard Reset**:
   - Verified 3-stage progression across all 6 crises: `WHISPERS` (warning, rifts/telegraphs) $\rightarrow$ `OUTBREAK` (escalation, active hazards, conveyor/lava/salvos) $\rightarrow$ `CLIMAX` (confrontation, objective timers, singularity/blowout).
   - Threat levels properly clamped $[0, 100]$: Whispers (10%), Outbreak ($\ge 35\%$), Climax ($\ge 70\%$), Resolved ($0\%$), Failed ($100\%$).
   - `BaseCrisis.reset()` (`BaseCrisis.ts:353-365`) resets stage to `INACTIVE`, threat to 0, clears all 195 hazard descriptors in `hazardTileBuffer` without heap allocation (`clearAllHazards()`), and calls `this.onInit()` which cleans up subclass state (craters, conduits, rifts, prisms).
2. **CRITICAL DEFECT: Runaway Resolution Counter in `CrisisManager.update` (`CrisisManager.ts:63-69`)**:
   - Source code snippet:
     ```ts
     this.activeCrisis.update(deltaMs, playerPos);
     const status = this.activeCrisis.getStatus();

     if (status.isVictorious && status.stage === CrisisStage.RESOLVED) {
       this.totalCrisesResolved++;
     }

     return status;
     ```
   - In `BaseCrisis.ts:109-111`:
     ```ts
     if (this.stage === CrisisStage.INACTIVE || this.stage === CrisisStage.RESOLVED || this.stage === CrisisStage.FAILED) {
       return;
     }
     ```
   - When a crisis is stabilized via `resolveCrisis()`, `this.stage` becomes `CrisisStage.RESOLVED` and `isVictorious` becomes `true`.
   - On every subsequent frame update in `GameScene.ts:1950` (`this.crisisManager.update(delta, playerPos)`), `status.isVictorious && status.stage === CrisisStage.RESOLVED` evaluates to `true`.
   - **Empirical Verification**:
     Running consecutive updates in node after `resolveCrisis()`:
     - After 1 update: `totalCrisesResolved = 1`
     - After 2 updates: `totalCrisesResolved = 2`
     - After 3 updates: `totalCrisesResolved = 3`
     During a 5-second victory alert before the player changes modes or exits, `totalCrisesResolved` increments $\approx 300$ times!
3. **Physical Hazard Clearance Inconsistency (`VoidCrisis.ts:197-209`, `LavaCrisis.ts:153-167`)**:
   - `handleBombBlast(r, c, radius)` cleanses hazards within `Math.abs(dr) + Math.abs(dc) <= radius`.
   - This cleanses a Manhattan diamond including diagonals (e.g. `dr = 1, dc = 1` for radius 2) and ignores obstacles/pillars, whereas Bomberman bomb fire propagates in cardinal rays (`dr === 0 || dc === 0`) blocked by solid tiles.

---

### 1.4 Perk Tree & Relic Synergies (`PerkTree.ts` & `RelicSystem.ts`)
1. **16 Perks, 8 Relics, 4 Synergies, and 500ms ICD**:
   - Exactly 16 perks across Baking (4), Sugar Rush (4), Resilience (4), and Alchemy (4) in `CONFECTIONERY_PERKS`.
   - 8 relics in `RELIC_CATALOG` (`POCKET_CHRONOMETER`, `GELATINOUS_CORE`, `PYROCLASTIC_PRISM`, `MAGNETRON_DIAL`, `VAMPIRIC_CONFECTION`, `SOLAR_CAPACITOR`, `VOID_SINGULARITY_LENS`, `CLOCKWORK_SPRING`).
   - 4 synergies in `SYNERGY_DEFINITIONS` (`Radiant Leech`, `Kinetic Pinball`, `Cosmic Supernova`, `Chrono Attraction`).
   - 500ms ICD loop protection in `RelicManager.checkAndSetIcd(procKey, nowMs)` (`RelicSystem.ts:242-249`) verified across all triggers.
   - 100% essence refund respec verified across 10,000 upgrade/respec cycles in `tests/progression.test.mjs:653-673`.
2. **CRITICAL ARCHITECTURAL DEFECT: Second Wind Never Triggered in `GameScene.ts`**:
   - `PerkTreeManager.triggerSecondWind` is defined in `PerkTree.ts:426-444`:
     ```ts
     static triggerSecondWind(bonuses: AppliedPerkBonuses, alreadyConsumed: boolean)
     ```
   - In `GameScene.ts:2873-2956` (`playerDie()`):
     ```ts
     if (this.hasShield) { ... return; }
     if (this.extraLives > 0) { ... return; }
     this.isGameOver = true;
     ```
     `playerDie()` only checks `this.hasShield` and `this.extraLives`. It NEVER checks `bonuses.hasSecondWind` or calls `PerkTreeManager.triggerSecondWind`.
   - Consequently, purchasing the `second_wind` perk provides zero lethal damage protection in actual gameplay!
3. **CRITICAL ARCHITECTURAL DEFECT: Relic System Disconnected in `GameScene.ts`**:
   - In `GameScene.ts:641-644`:
     ```ts
     private onRelicsUpdated = (_relics: unknown) => {
       void _relics;
       this.emitStatsUpdate();
     };
     ```
   - `RelicManager` is NEVER instantiated as an active subsystem in `GameScene.ts`.
   - The proc methods (`onEnemyKilled`, `onBombPlaced`, `onBombExploded`, `onWallBounce`, `onBombKicked`) are never invoked during live game events.
   - Equipped relics appear in the React HUD, but have 0 live gameplay effect inside Phaser!

---

### 1.5 React-Phaser Bridge Contracts (`BombermanGame.tsx` & `GameScene.ts`)
1. **Verified Bridge Pairings**:
   - `stats-update`: Emitted by `GameScene.emitStatsUpdate()`, received by `BombermanGame.tsx:465`. Cleanup verified at unmount.
   - `mode-changed`: Emitted by `BombermanGame.tsx:86, 219`, received by `GameScene.ts:1392`. Cleanup in `shutdown()` verified.
   - `boss-hud-update`: Emitted per frame by `BossHUD.ts:334`, received by `BombermanGame.tsx:485`. Cleanup verified.
   - `situation-log-update`: Emitted by `SituationLog.ts:75`, received by `BombermanGame.tsx:491`. Cleanup verified.
   - `currency-reward`: Emitted on boss defeat in `GameScene.ts:1935`, received by `BombermanGame.tsx:479`.
2. **CRITICAL CONTRACT GAP: `resume-run-state` is a No-Op Stub (`GameScene.ts:646-649`)**:
   - Source code snippet:
     ```ts
     private onResumeRunState = (_savedRun: unknown) => {
       void _savedRun;
       this.emitStatsUpdate();
     };
     ```
   - When a user resumes a saved run via `handleResumeRun` in `BombermanGame.tsx:218`, the serialized run state (`SerializedRunState` containing player coordinates, grid board, items, active bombs) is passed into `resume-run-state`.
   - `GameScene` immediately discards `_savedRun` via `void _savedRun;`, and then handles `mode-changed` which rebuilds the standard default stage from scratch. The saved run is never restored!
3. **CRITICAL ARCHITECTURAL GAP: `GameModeManager` Unwired in `GameScene.ts`**:
   - `GameModeManager` (`src/game/progression/GameModes.ts:123`) contains the complete orchestration for Boss Rush (5-boss sequence, 20s Madame Bonbon rest stops, medal calculation), Crisis Survival (60s waves, 45s drop pod deliveries), and Endless Gauntlet (chamber routing, 3-card boon drafting).
   - In `GameScene.ts`, `onModeChanged` merely hardcodes starting `King Gummy Bear` for Boss Rush and `Pastel Void` for Crisis Survival. When King Gummy Bear dies, `GameScene.ts:1936` calls `this.dismissBoss()` and terminates the encounter without continuing the Boss Rush sequence!

---

### 1.6 Quality Gates & Test Suite Audit
1. **Quality Gates Results**:
   - `npm test`: Exited code 0. 644/644 tests passed across 42 test files in 1,910ms.
   - `npm run lint`: Exited code 0. 0 errors, 39 warnings (all 39 are unused variables in test/agent files).
   - `npm run build`: Exited code 0. Compiled successfully in 765ms, static prerender (4/4 pages).
2. **Audit of 42 Test Files (`tests/`)**:
   - Test files are comprehensive for unit math, headless pathfinding, object pooling, and adversarial stress.
   - **Test Omissions Found**:
     1. Zero tests in `tests/` check whether `resume-run-state` actually restores any game state.
     2. Zero tests in `tests/` check `GameScene` reaction to `perks-updated` or `relics-updated`.
     3. Zero tests in `tests/` check `Second Wind` trigger inside `playerDie()`.
     4. `tests/progression.test.mjs` test for mutator conflicts only tests seeds generated by $w \times 104729$ for $w = 6..50$, missing the duplicate mutator collision occurring at arbitrary seeds.
     5. Zero tests check that consecutive `CrisisManager.update()` calls after `resolveCrisis()` do not repeatedly increment `totalCrisesResolved`.

---

## 2. Logic Chain

```
[Observation 1.2.2: generateWaveMutators incompatible check]
  └─ idx1 = 3 (GLASS_CANNON), idx2 = 2 (DENSE_FORTIFICATION)
  └─ Incompatible resolver executes idx2 = (2 + 1) % 7 = 3
  └─ allKeys[3] is GLASS_CANNON == mutator1
  └─ Output: [GLASS_CANNON, GLASS_CANNON] (DUPLICATE)
  └─ Logic inference: Resolving conflict must ensure idx2 !== idx1.

[Observation 1.3.2: CrisisManager.update level-triggered check]
  └─ status.isVictorious && status.stage === CrisisStage.RESOLVED remains true for ~5000ms
  └─ CrisisManager.update() called every 16ms frame in GameScene.ts:1950
  └─ totalCrisesResolved increments on every frame (300+ times per crisis)
  └─ Logic inference: Counter increment must be edge-triggered (only on initial state transition to RESOLVED).

[Observation 1.4.2: GameScene.playerDie vs PerkTree.triggerSecondWind]
  └─ PerkTreeManager.triggerSecondWind exists as pure method
  └─ GameScene.playerDie checks only hasShield and extraLives, then sets isGameOver = true
  └─ Logic inference: Second Wind perk is completely ignored in live gameplay.

[Observation 1.4.3 & 1.5.2: RelicManager & resume-run-state stubs in GameScene]
  └─ onRelicsUpdated = (_relics) => { void _relics; }
  └─ onResumeRunState = (_savedRun) => { void _savedRun; }
  └─ GameModeManager never instantiated in GameScene
  └─ Logic inference: Advanced progression systems (Relics, Run Resumption, 5-Boss Gauntlet sequence)
     exist in isolated TypeScript modules and React state, but have stubbed integration in GameScene.ts.
```

---

## 3. Caveats

1. **Read-Only Inspection Scope**: In strict accordance with the explorer archetype and user instructions, no production source code has been altered during this audit. Concrete remediation diffs and tests are provided below for the remediation agents.
2. **Phaser WebGL/Canvas Headless Constraints**: Headless Node.js unit tests (`npm test`) rely on mocks or pure math models. Phaser's visual display and scene lifecycle can only be fully executed in a real browser context.
3. **Lint Warnings**: The 39 ESLint warnings are strictly unused variables in test files (`tests/empirical_challenge_stress.test.mjs`, `tests/skills_gimmicks_hud_stress.test.mjs`, and `.agents/` temporary prototypes). They do not affect production bundles or runtime stability.

---

## 4. Conclusion

The architecture of Bomberman Infinite Evolution is remarkably sophisticated, with complete zero-GC data structures, 42 comprehensive test files, and clean TypeScript typings. However, this Total Inspection has uncovered **4 critical architectural defects and 2 contract omissions** that must be addressed:

| ID | Domain | Severity | Exact Location | Description |
|---|---|---|---|---|
| **ARCH-SCALE-01** | Progression | **High** | `ScalingEngine.ts:226-233` | Duplicate mutators generated when resolving incompatible affixes (`[GLASS_CANNON, GLASS_CANNON]`). |
| **ARCH-CRISIS-01** | Crises | **High** | `CrisisManager.ts:66-68` | Level-triggered `totalCrisesResolved++` causes runaway counter (~300 increments per crisis). |
| **ARCH-PERK-01** | Progression | **High** | `GameScene.ts:2873-2956` | `Second Wind` lethal damage immunity is never invoked in `playerDie()`. |
| **ARCH-RELIC-01** | Progression | **Medium** | `GameScene.ts:641-644` | `onRelicsUpdated` is a void stub; `RelicManager` runtime procs are not wired into gameplay. |
| **ARCH-PERSIST-01**| Persistence | **Medium** | `GameScene.ts:646-649` | `onResumeRunState` is a void stub; saved game board and player state are ignored. |
| **ARCH-MODE-01** | Game Modes | **Medium** | `GameScene.ts:1933-1937` | `GameModeManager` Boss Rush 5-boss sequence and rest stops are not wired; only King Gummy Bear runs. |

---

## 5. Concrete Remediation Proposals

### 5.1 Fix for ARCH-SCALE-01 (`ScalingEngine.ts`)
In `src/game/progression/ScalingEngine.ts`, replace lines 226-233:
```ts
<<<<
    // Incompatible pairs check
    if (
      (mutator1.id === WaveMutatorId.GLASS_CANNON && mutator2.id === WaveMutatorId.DENSE_FORTIFICATION) ||
      (mutator1.id === WaveMutatorId.DENSE_FORTIFICATION && mutator2.id === WaveMutatorId.GLASS_CANNON)
    ) {
      idx2 = (idx2 + 1) % allKeys.length;
      mutator2 = WAVE_MUTATOR_CATALOG[allKeys[idx2]];
    }
====
    // Incompatible pairs check & collision guard
    if (
      (mutator1.id === WaveMutatorId.GLASS_CANNON && mutator2.id === WaveMutatorId.DENSE_FORTIFICATION) ||
      (mutator1.id === WaveMutatorId.DENSE_FORTIFICATION && mutator2.id === WaveMutatorId.GLASS_CANNON)
    ) {
      idx2 = (idx2 + 1) % allKeys.length;
      if (idx2 === idx1) {
        idx2 = (idx2 + 1) % allKeys.length;
      }
      mutator2 = WAVE_MUTATOR_CATALOG[allKeys[idx2]];
    }
>>>>
```

### 5.2 Fix for ARCH-CRISIS-01 (`CrisisManager.ts`)
In `src/game/crises/CrisisManager.ts`:
Add a private boolean flag `private hasCountedResolution: boolean = false;`.
- In `triggerCrisis()`: `this.hasCountedResolution = false;`
- In `reset()`: `this.hasCountedResolution = false;`
- In `update()` (lines 66-68):
```ts
<<<<
    if (status.isVictorious && status.stage === CrisisStage.RESOLVED) {
      this.totalCrisesResolved++;
    }
====
    if (status.isVictorious && status.stage === CrisisStage.RESOLVED && !this.hasCountedResolution) {
      this.hasCountedResolution = true;
      this.totalCrisesResolved++;
    }
>>>>
```

### 5.3 Fix for ARCH-PERK-01 (`GameScene.ts`)
In `src/game/GameScene.ts`:
1. Add property `private hasUsedSecondWind: boolean = false;` and `private appliedPerkBonuses: AppliedPerkBonuses | null = null;`.
2. In `onPerksUpdated`: store `this.appliedPerkBonuses = PerkTreeManager.calculateAppliedBonuses(perks);`.
3. In `playerDie()`:
```ts
    if (this.appliedPerkBonuses && !this.hasUsedSecondWind) {
      const sw = PerkTreeManager.triggerSecondWind(this.appliedPerkBonuses, this.hasUsedSecondWind);
      if (sw.saved) {
        this.hasUsedSecondWind = true;
        this.isInvulnerable = true;
        this.shieldInvulnerableUntil = this.time.now + sw.invulnDurationMs;
        this.spawnFloatingText(this.player.x, this.player.y - 12, '💖 SECOND WIND!', '#f43f5e');
        this.cameras.main.flash(300, 244, 63, 94);
        this.tweens.add({
          targets: this.player,
          alpha: 0.3,
          duration: 100,
          yoyo: true,
          repeat: 14,
          onComplete: () => {
            if (this.player && this.player.active) {
              this.player.alpha = 1;
              if (!this.isDashing && !this.isAegisOverdriveActive) {
                this.isInvulnerable = false;
              }
            }
          },
        });
        this.emitStatsUpdate();
        return;
      }
    }
```

---

## 6. Recommended Permanent Defensive Tests

Add the following permanent test cases to `tests/progression.test.mjs` and `tests/crises.test.mjs`:

1. **Wave Mutator Adversarial Exhaustive Seed Fuzzing**:
   ```js
   test('Defensive [ScalingEngine]: generateWaveMutators produces 100% distinct mutators across 10,000 seeds', () => {
     for (let seed = 0; seed < 10000; seed++) {
       const muts = ScalingEngine.generateWaveMutators(6, seed);
       assert.equal(muts.length, 2);
       assert.notEqual(muts[0].id, muts[1].id, `Duplicate mutator ${muts[0].id} at seed ${seed}`);
     }
   });
   ```

2. **Crisis Manager Resolution Single-Increment Invariant**:
   ```js
   test('Defensive [CrisisManager]: totalCrisesResolved strictly increments exactly once across multiple update ticks', () => {
     const cm = new CrisisManager();
     cm.triggerCrisis(CrisisType.PASTEL_VOID);
     cm.getActiveCrisis().resolveCrisis();
     
     assert.equal(cm.getTotalCrisesResolved(), 0);
     for (let i = 0; i < 300; i++) {
       cm.update(16);
     }
     assert.equal(cm.getTotalCrisesResolved(), 1, 'Resolution counter must not run away across frames!');
   });
   ```

---

## 7. Verification Method

To independently verify all findings and quality gates:
1. **Full Test Suite Execution**:
   ```bash
   npm test
   ```
   Expect: 644/644 tests pass in 42 suites.
2. **Lint Audit**:
   ```bash
   npm run lint
   ```
   Expect: 0 errors, 39 warnings.
3. **Production Build Validation**:
   ```bash
   npm run build
   ```
   Expect: Turbopack exit code 0.
4. **Mutator Duplicate Bug Reproduction**:
   ```bash
   node -e 'const { ScalingEngine } = require("./src/game/progression/ScalingEngine.ts"); const m = ScalingEngine.generateWaveMutators(6, 80); console.log("Mutator IDs:", m.map(x => x.id));'
   ```
   Expect: Prints `[ 'GLASS_CANNON', 'GLASS_CANNON' ]`.
5. **Crisis Resolution Runaway Counter Reproduction**:
   ```bash
   node -e 'const { CrisisManager } = require("./src/game/crises/CrisisManager.ts"); const cm = new CrisisManager(); cm.triggerCrisis("pastel_void"); cm.getActiveCrisis().resolveCrisis(); cm.update(16); cm.update(16); console.log("Resolved count:", cm.getTotalCrisesResolved());'
   ```
   Expect: Prints `Resolved count: 2` (demonstrating runaway increment).
