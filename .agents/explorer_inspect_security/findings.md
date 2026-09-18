# Comprehensive Security, Persistence & Input Sanitization Inspection Report

**Project**: Bomberman Infinite Evolution  
**Milestone**: Total Inspection ("총검사")  
**Inspector**: Security, Persistence & Input Sanitization Inspector (`explorer_inspect_security`)  
**Date**: 2026-09-18  
**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_inspect_security/`  

---

## 1. Executive Summary

A comprehensive, forensic audit of the Bomberman codebase was conducted focusing on data persistence, cryptographic checksum integrity, storage quota resilience, prototype pollution vectors, input sanitization, API 429 circuit breaking, and adversarial chaos testing.

### Key Strengths Verified
1. **Cryptographic Checksum Architecture**: Robust 24-character hexadecimal digest combining 64-bit FNV-1a and 32-bit DJB2 hash seeded with `BOMBERMAN_INTEGRITY_SALT_V1_2026`. Employs deterministic canonical key sorting and constant-time XOR comparison to prevent side-channel timing attacks.
2. **Zero Eval / Zero Unsafe HTML**: Comprehensive codebase scanning verified complete absence of `eval()`, `new Function()`, and `dangerouslySetInnerHTML`.
3. **Map RLE Compression**: 2D tile matrices are compressed efficiently via run-length encoding (195 cells compress to ~30–60 bytes), keeping storage payloads well below web storage quotas.
4. **Adversarial Chaos Bot Suite**: `tests/chaos_resilience.test.mjs` successfully verifies 50,000 adversarial actions across multi-touch spam, boundary breaking, pause toggling, and ultimate gauge fuzzing with zero coordinate NaNs.

### Critical Vulnerabilities & Defects Identified
1. **CircuitBreaker Offline Queue Stall (High Severity)**: In `CircuitBreaker.ts:drainQueue()`, if an enqueued request experiences a non-429 error and is re-queued, the loop breaks while the breaker remains in `CLOSED` state. No retry timer is scheduled, causing the request to remain permanently stuck in an unresolved Promise hang.
2. **WebStorageAdapter Quota Fallback Desynchronization (Medium Severity)**: When browser storage reaches quota limit, `setItem()` catches `QuotaExceededError` and writes to in-memory fallback. However, subsequent `getItem()` calls still query the original browser storage first without error, returning stale or null data.
3. **Prototype Inheritance Crash in `PerkTreeManager` (High Severity)**: `CONFECTIONERY_PERKS` inherits from `Object.prototype`. Calling `canUpgradePerk()` with prototype property names (`"toString"`, `"valueOf"`, `"constructor"`, `"__proto__"`) resolves to prototype methods/objects, triggering uncaught `TypeError: Cannot read properties of undefined (reading costs)` and crashing the application.
4. **GameScene State Persistence Integration Disconnect (Medium Severity)**: `BombermanGame.tsx` implements save/resume UI and emits `'resume-run-state'`, but `GameScene.ts` registers NO listener for `'resume-run-state'`. Resuming a run updates HUD stats but leaves the game canvas uninitialized with the saved game state. Furthermore, `handleSaveRun()` saves dummy defaults (`x: 60, y: 60`, `mapRLE: ''`) rather than extracting live entity positions from Phaser.
5. **Lack of Schema Sanitization on Imported Save Packages (Medium Severity)**: `importSavePackage()` validates checksums but does not sanitize fields. An imported file can inject negative perk levels (causing `remainingEssence: NaN`), negative currencies, or prototype-shadowing properties into player inventory.
6. **Destructive Schema Version Handling (Low Severity)**: In `GameStatePersistence.ts`, any mismatch with `STORAGE_SCHEMA_VERSION = 1` immediately resets the user's `metaProfile` to blank defaults rather than running a migration pipeline, risking catastrophic progression loss upon future updates.

---

## 2. Checksum Validation, Tamper Resistance & Schema Evolution

### 2.1 Checksum Design & Implementation
- **Files**: `src/game/persistence/GameStatePersistence.ts` (lines 216–287)
- **Algorithm**:
  - **Canonical Stringification**: `canonicalStringify(value)` recursively traverses objects, sorts own keys alphabetically, excludes the `'checksum'` field, and filters out `undefined` values.
  - **Hash Combination**: Seeding with `'BOMBERMAN_INTEGRITY_SALT_V1_2026'`, the engine computes:
    1. 64-bit FNV-1a hash formatted as 16 hexadecimal characters.
    2. 32-bit DJB2 hash formatted as 8 hexadecimal characters.
    3. Output: Deterministic 24-character hexadecimal string (`/^[0-9a-f]{24}$/`).
  - **Constant-Time Verification**: `verifyChecksum()` iterates character-by-character using bitwise XOR (`mismatch |= computed.charCodeAt(i) ^ expectedChecksum.charCodeAt(i)`), preventing timing analysis attacks.

### 2.2 Tampering Resilience
Empirically validated in `tests/persistence.test.mjs` (lines 146–175):
- Mutating player score (e.g. `1000` -> `999999`) alters hash digest and fails verification.
- Mutating nested player HP or inventory items triggers avalanche effect across the 96-bit combined space.
- Tampered states stored in `sessionStorage` or `localStorage` are safely rejected upon load.

### 2.3 Corrupted JSON Handling
- In `loadRunState()` (lines 351–387): Corrupted JSON throws within `try/catch` and returns `null`.
- In `loadMetaProfile()` (lines 454–486): Checksum mismatch or JSON syntax errors log a warning and safely restore safe defaults via `createDefaultMetaProfile()`.
- In `importSavePackage()` (lines 515–580): Malformed JSON, application identifier mismatches (`exportApp !== 'bomberman-infinite-evolution'`), and corrupted package checksums return `{ success: false, error: ... }`.

### 2.4 Schema Evolution Defect
- **Location**: `GameStatePersistence.ts` lines 357–360, 464–469, 539–544
- **Observation**:
  ```ts
  // loadMetaProfile:
  if (!envelope || envelope.version !== STORAGE_SCHEMA_VERSION || !envelope.profile) {
    const defaultProfile = this.createDefaultMetaProfile();
    this.saveMetaProfile(defaultProfile);
    return defaultProfile;
  }
  ```
- **Risk**: If the game evolves to version 2 (`STORAGE_SCHEMA_VERSION = 2`), all players with version 1 profiles will have their entire profile (unlocked perks, cosmic essence, star candies, trophies) wiped and replaced with default values.
- **Recommendation**: Implement a version migration pipeline:
  ```ts
  function migrateMetaProfile(profile: any, fromVersion: number): MetaProfile {
    if (fromVersion === 1) {
      // apply v1 -> v2 schema migrations
    }
    return profile;
  }
  ```

### 2.5 Architectural Disconnect: Persistence vs. GameScene
- **Location**: `src/components/BombermanGame.tsx` (lines 171–222) vs `src/game/GameScene.ts`
- **Observations**:
  1. In `BombermanGame.tsx:handleSaveRun`:
     ```ts
     player: { x: 60, y: 60, gridRow: 1, gridCol: 1, facing: 'down', stats, hp: 3 },
     board: { rows: 13, cols: 15, mapRLE: '' },
     activeBombs: [], activeEntities: [], activeItems: [],
     ```
     The save handler does not extract the active player position, dynamic map tiles, active bombs, or enemies from Phaser.
  2. In `BombermanGame.tsx:handleResumeRun`:
     ```ts
     phaserGameRef.current.events.emit('resume-run-state', runState);
     ```
     `GameScene.ts` contains ZERO listeners for `'resume-run-state'` (confirmed via grep search). Resuming a run fails to restore board state, player position, or active entities in the game canvas.

---

## 3. Storage Limits & Web Storage Quota Handling

### 3.1 Architecture
- **Files**: `src/game/persistence/GameStatePersistence.ts` (lines 32–118)
- **Adapters**:
  - `MemoryStorageAdapter`: In-memory `Map<string, string>` implementation.
  - `WebStorageAdapter`: Wraps `window.sessionStorage` and `window.localStorage` with a fallback `MemoryStorageAdapter`.

### 3.2 Private Browsing / Headless Detection
- Constructor checks for `typeof window !== 'undefined'` and performs a write/remove test (`__test_${Date.now()}`). If Safari private browsing or iframe sandboxing throws `SecurityError`, `this.storage` is set to `null` and the adapter operates purely in-memory without crashing.

### 3.3 Critical QuotaExceededError Desynchronization Bug
- **Location**: `GameStatePersistence.ts` lines 84–95 & 72–81
- **Code**:
  ```ts
  public getItem(key: string): string | null {
    if (this.storage) {
      try {
        return this.storage.getItem(key);
      } catch {
        return this.fallback.getItem(key);
      }
    }
    return this.fallback.getItem(key);
  }

  public setItem(key: string, value: string): void {
    if (this.storage) {
      try {
        this.storage.setItem(key, value);
        return;
      } catch {
        // Fallback to memory on quota error or exception
        this.fallback.setItem(key, value);
        return;
      }
    }
    this.fallback.setItem(key, value);
  }
  ```
- **Defect Mechanism**:
  1. Browser storage has existing data for key `'bomberman_profile_v1'`.
  2. A new save exceeds the storage quota (e.g. 5MB exceeded by other domain data).
  3. `this.storage.setItem()` throws `QuotaExceededError`.
  4. The catch block executes `this.fallback.setItem(key, value)`. The updated profile is saved to in-memory fallback.
  5. On the subsequent `getItem(key)` call, `this.storage.getItem(key)` succeeds (reads do not throw quota errors).
  6. The adapter returns the STALE data from `this.storage`!
- **Empirical Reproduction**:
  Verified via Node.js simulation: `getItem()` returned stale initial value (`INITIAL_VALUE`) instead of updated value.
- **Remediation**:
  If `setItem()` throws, mark `this.storage = null` or synchronize fallback by clearing/removing failed keys from storage.

---

## 4. Prototype Pollution, Unsafe Eval & Input Sanitization

### 4.1 Evaluation of Dynamic Code Execution
- Search Query: `eval`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`.
- Result: **0 instances in game engine**. All entity rendering uses Phaser 3 canvas primitives and procedural SVG textures.

### 4.2 Critical Prototype Lookup Crash in `PerkTreeManager`
- **Location**: `src/game/progression/PerkTree.ts` (lines 16–223, 238–248)
- **Code**:
  ```ts
  export const CONFECTIONERY_PERKS: Record<string, PerkNode> = { ... };

  static canUpgradePerk(perkId: string, currentPerks: PerkState, availableEssence: number) {
    const node = CONFECTIONERY_PERKS[perkId];
    if (!node) {
      return { canUpgrade: false, cost: 0, reason: 'Unknown perk ID' };
    }
    const currentLevel = currentPerks[perkId] || 0;
    if (currentLevel >= node.maxLevel) { ... }
    const cost = node.costs[currentLevel]; // <-- CRASHES HERE!
  ```
- **Defect Mechanism**:
  1. `CONFECTIONERY_PERKS` is a standard object literal inheriting from `Object.prototype`.
  2. If `perkId` is `"toString"`, `"valueOf"`, `"constructor"`, or `"__proto__"`:
     - `CONFECTIONERY_PERKS[perkId]` resolves to the prototype method/object (truthy).
     - `if (!node)` check passes because `node` is not null/undefined.
     - `node.costs` is `undefined`.
     - `node.costs[currentLevel]` attempts to access property `0` of `undefined`.
  3. **Result**: Uncaught exception:
     `TypeError: Cannot read properties of undefined (reading 'function toString() { [native code] }')`
- **Empirical Reproduction**:
  Verified in Node.js: `PerkTreeManager.canUpgradePerk("toString", {}, 100)` crashed the process with exit code 1.
- **Remediation**:
  Use `Object.hasOwn()` or `Object.prototype.hasOwnProperty.call(CONFECTIONERY_PERKS, perkId)`:
  ```ts
  if (!Object.prototype.hasOwnProperty.call(CONFECTIONERY_PERKS, perkId)) {
    return { canUpgrade: false, cost: 0, reason: 'Unknown perk ID' };
  }
  ```

### 4.3 Prototype Shadowing in Chaos Bot Input
- **Location**: `tests/chaos_resilience.test.mjs` (line 185)
- **Code**:
  ```ts
  injectInput(key, rawValue) {
    this.totalActionsProcessed++;
    const boolVal = Boolean(rawValue);
    if (key in this.input) {
      this.input[key] = boolVal;
    }
  }
  ```
- **Defect**: The `in` operator checks prototype properties. If `key === "toString"`, `"toString" in this.input` is true, causing `this.input.toString = boolVal` and shadowing the native prototype function.
- **Remediation**: Use `Object.prototype.hasOwnProperty.call(this.input, key)` or `key in Object.keys(this.input)`.

### 4.4 Arbitrary Property Injection via Save Import
- **Location**: `GameStatePersistence.ts:importSavePackage()` (lines 554–574)
- **Code**:
  ```ts
  if (pkg.metaProfile) {
    this.saveMetaProfile(pkg.metaProfile);
  }
  ```
- **Defect**:
  - No whitelist validation is performed on keys in `pkg.metaProfile` or `pkg.metaProfile.perks`.
  - Negative values (e.g. `sugar_spark: -5`) cause `PerkTreeManager.upgradePerk` to calculate `cost = undefined`, poisoning user currency to `NaN`.
  - In `applyItemEffect()`, injecting arbitrary item names (e.g. `"toString"`) mutates `stats.inventory["toString"]` to `'function toString() { [native code] }1'`, corrupting HUD inventory rendering.
- **Remediation**: Sanitize imported profile properties against defined schemas and clamp numerical fields to non-negative bounds.

---

## 5. API 429 Recovery & CircuitBreaker Queue Integrity

### 5.1 Architecture & Backoff Strategy
- **Files**: `src/game/persistence/CircuitBreaker.ts`
- **FSM States**: `CLOSED`, `OPEN`, `HALF_OPEN`.
- **429 Handling**:
  - Immediate trip to `OPEN` on status 429, `RESOURCE_EXHAUSTED`, or rate limit messages.
  - Triggers emergency save callback (`saveFn()`) before queuing or delaying.
  - Parses HTTP `Retry-After` header (seconds or RFC date string).
  - Exponential backoff: `initialBackoffMs * 2^(min(consecutive429Count - 1, 8))` with `+/- 20%` uniform jitter, capped at `maxBackoffMs` (default 32,000ms).

### 5.2 Critical Offline Queue Stall Defect
- **Location**: `CircuitBreaker.ts:drainQueue()` (lines 280–312)
- **Code**:
  ```ts
  public async drainQueue(): Promise<number> {
    if (this.isDraining) return 0;
    this.isDraining = true;
    let processedCount = 0;

    try {
      while (this.offlineQueue.length > 0 && this.getState() !== CircuitBreakerState.OPEN) {
        const item = this.offlineQueue.shift();
        if (!item) break;

        try {
          const result = await item.execute();
          item.resolve(result);
          this.recordSuccess();
          processedCount++;
        } catch (err) {
          this.recordFailure(err);
          item.retries++;
          if (this.isQuotaError(err) || item.retries > 3) {
            item.reject(err);
          } else {
            // Re-queue at head
            this.offlineQueue.unshift(item);
          }
          break; // <-- BREAKS HERE WHILE BREAKER IS CLOSED!
        }
      }
    } finally {
      this.isDraining = false;
    }
    return processedCount;
  }
  ```
- **Defect Mechanism**:
  1. Circuit breaker transitions from `OPEN` to `CLOSED` after recovery.
  2. `drainQueue()` starts processing `offlineQueue`.
  3. A queued request experiences a non-quota error (e.g. temporary socket timeout).
  4. `this.recordFailure(err)` increments `consecutiveFailures` to 1. Since 1 < `failureThreshold` (3), the circuit breaker **REMAINS CLOSED**.
  5. The item has `retries === 1` (<= 3), so it is re-queued with `this.offlineQueue.unshift(item)`.
  6. The catch block executes `break;`, terminating `drainQueue()`.
  7. **Failure**: The circuit breaker is `CLOSED`, but NO timer or background retry is scheduled. The queued item is trapped at the head of `offlineQueue` in an unresolved Promise hang indefinitely!
- **Empirical Reproduction**:
  Verified via Node.js reproduction script: after 100ms, queue length remained 1, breaker state remained `CLOSED`, and the Promise was permanently unresolved.
- **Remediation**:
  If re-queuing an item while state is `CLOSED` or `HALF_OPEN`, schedule an immediate or backoff retry:
  ```ts
  if (this.getState() !== CircuitBreakerState.OPEN) {
    setTimeout(() => void this.drainQueue(), 250);
  }
  ```

---

## 6. Chaos Test Coverage Evaluation (`tests/chaos_resilience.test.mjs`)

### 6.1 Strengths & Accomplishments
`tests/chaos_resilience.test.mjs` runs 50,000 actions across 6 test suites:
- **Multi-Touch Spam**: Alternating rapid keys, concurrent opposing directions (up+down, left+right). Verified zero coordinate drift outside `[20, 580]x[20, 500]`.
- **Gauge Fuzzing**: Tested extreme charges (`-999999`, `1e12`, `NaN`, `Infinity`, `null`, `undefined`). Confirmed strict clamping to `[0, 100]` with zero NaNs.
- **Pause Oscillation**: High-frequency pause/unpause toggling (every 2 frames) during active bomb placement. Confirmed all bombs detonate cleanly without orphaned state.
- **Physical Boundary Clamping**: 3,000 steps driving into top-left and bottom-right corners, 2,000 steps of portal warp ping-pong. Verified zero boundary penetration.

### 6.2 Identified Chaos Test Coverage Gaps
1. **No Save State / Persistence Chaos**:
   - Save triggers are never invoked during chaotic physics states (e.g. while in portal cooldown, during active dash, or mid-explosion).
   - No chaos tests simulate storage quota failure during gameplay.
2. **No Prototype Key Fuzzing in Input Testing**:
   - The test suite uses a static whitelist of 7 keys. It never injects prototype properties (`toString`, `valueOf`, `__proto__`) to test input sanitization.
3. **No Concurrent CircuitBreaker Chaos**:
   - The circuit breaker is not stressed under asynchronous chaos (e.g. 50 concurrent requests during rapid 429 toggling and network dropouts).
4. **No Corrupted Save Import Fuzzing**:
   - No chaos tests evaluate `importSavePackage()` under fuzzed or malicious save packages (e.g. negative perk levels, out-of-bounds currencies, prototype payloads).
5. **Pool Fidelity**:
   - `chaos_resilience.test.mjs` defines a simplified `ChaosObjectPool` rather than exercising the production `ObjectPool<T>` from `src/game/pooling/ObjectPool.ts`.

---

## 7. Actionable Remediation Matrix

| ID | Component | Defect | Severity | Proposed Fix |
|---|---|---|---|---|
| **SEC-01** | `CircuitBreaker.ts:drainQueue` | Offline queue hangs indefinitely when re-queuing non-429 failures in `CLOSED` state | **HIGH** | Add delayed retry trigger (`setTimeout(() => void this.drainQueue(), 250)`) when re-queuing in `CLOSED`/`HALF_OPEN` state. |
| **SEC-02** | `PerkTree.ts:canUpgradePerk` | Uncaught `TypeError` when looking up prototype keys (`toString`, `valueOf`, `constructor`) in `CONFECTIONERY_PERKS` | **HIGH** | Guard with `Object.prototype.hasOwnProperty.call(CONFECTIONERY_PERKS, perkId)` or `Object.hasOwn()`. |
| **SEC-03** | `GameStatePersistence.ts:WebStorageAdapter` | Storage quota error causes fallback desync (reads return stale storage value) | **MEDIUM** | In `WebStorageAdapter.setItem()`, set `this.storage = null` or clear key on `QuotaExceededError`. |
| **SEC-04** | `BombermanGame.tsx` & `GameScene.ts` | Saved run state not restored in Phaser canvas (`resume-run-state` unhandled; dummy coords saved) | **MEDIUM** | Add `'resume-run-state'` listener in `GameScene.ts` and query live player/board state in `handleSaveRun()`. |
| **SEC-05** | `GameStatePersistence.ts:importSavePackage` | Lack of schema validation on imported `metaProfile` permits negative perks & NaN corruption | **MEDIUM** | Validate and sanitize perk levels (`Math.max(0, Math.min(lvl, maxLevel))`) and currencies (`Math.max(0, val || 0)`). |
| **SEC-06** | `GameStatePersistence.ts:loadMetaProfile` | Schema version mismatch silently wipes player profile | **LOW** | Implement `migrateMetaProfile(raw, fromVersion)` pipeline before falling back to defaults. |
| **SEC-07** | `chaos_resilience.test.mjs` | Gaps in chaos testing (no persistence chaos, no prototype key fuzzing, no circuit breaker chaos) | **LOW** | Add targeted defensive chaos test suites for persistence, prototype keys, and circuit breaker concurrency. |

