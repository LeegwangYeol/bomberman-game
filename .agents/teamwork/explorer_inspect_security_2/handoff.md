# Security & Persistence Audit Report (총검사)

**Agent Role**: Security & Persistence Auditor (`explorer_inspect_security_2`)  
**Target Repository**: `/Users/user/src/bomberman`  
**Date**: 2026-09-29  
**Audit Scope**:
1. `src/game/persistence/GameStatePersistence.ts` (RLE compression, canonical serialization, 24-hex checksums, tamper resistance)
2. `src/game/persistence/GameStatePersistence.ts` (`WebStorageAdapter`, `MemoryStorageAdapter`, `QuotaExceededError` handling, private browsing resilience)
3. `src/game/persistence/GameStatePersistence.ts` & `src/game/progression/PerkTree.ts` (Save package JSON export/import sanitization, prototype pollution defense, currency clamping, negative perk level rejection)
4. `src/game/persistence/CircuitBreaker.ts` (API 429 quota backoff, uniform jitter, offline queueing, emergency save callbacks, queue drain mechanics)
5. `src/components/BombermanGame.tsx` (Keyboard event handling, modal key interception, sticky key prevention, background input bleed, modal transitions)

---

## 1. Observation

### 1.1 GameStatePersistence & Checksum Mechanics
- **File**: `src/game/persistence/GameStatePersistence.ts`
  - **Lines 136–165 (`compressGrid`)**: Compresses 2D grid matrix into comma-delimited `countxvalue` tokens. Tested on uniform grids (`195x0`, `195x1`) and checkered maps losslessly.
  - **Lines 170–219 (`decompressGrid`)**: Allocates `new Array(cols).fill(0)` per row. Validates token format (`parts.length === 2`), parses `count` and `val` with `parseInt(..., 10)`. Checks `isNaN`, `count <= 0`, checks element count against `expectedTotal = rows * cols`, and throws errors on boundary or format mismatch.
  - **Lines 231–250 (`canonicalStringify`)**: Deterministically stringifies objects by sorting keys alphabetically (`Object.keys(obj).filter(k => k !== 'checksum' && obj[k] !== undefined).sort()`). Handles arrays and primitives recursively.
  - **Lines 255–280 (`calculateChecksum`)**: Seeds input with salt `BOMBERMAN_INTEGRITY_SALT_V1_2026:`. Combines 64-bit FNV-1a (16 hex chars) and 32-bit DJB2 (8 hex chars) to yield a 24-hex digest.
  - **Lines 285–296 (`verifyChecksum`)**: Compares computed checksum against expected checksum using a constant-time bitwise accumulator (`mismatch |= computed.charCodeAt(i) ^ expectedChecksum.charCodeAt(i)`), avoiding timing side-channel attacks.
  - **Lines 371–376 (`loadRunState`)**: Verifies checksum prior to RLE decompression. If checksum fails, logs warning and returns `null`.

### 1.2 Storage Quota & Private Browsing Fallbacks
- **File**: `src/game/persistence/GameStatePersistence.ts`
  - **Lines 58–72 (`WebStorageAdapter.constructor`)**: Storage initialization is wrapped in a `try...catch`. In environments where `window.localStorage` or `window.sessionStorage` is restricted (e.g., Safari private browsing, iframe storage blocking, or SSR), any thrown exception results in `this.storage = null`, falling back to `this.fallback` (`MemoryStorageAdapter`).
  - **Lines 74–88 (`WebStorageAdapter.getItem`)**: First inspects `this.fallback.getItem(key)` (SEC-03). If a fallback entry exists, it returns it immediately, preventing stale reads if previous writes failed due to storage quota limits.
  - **Lines 90–104 (`WebStorageAdapter.setItem`)**: If `this.storage.setItem(key, value)` throws `QuotaExceededError` or any exception, the error is caught silently, and the entry is stored in `this.fallback.setItem(key, value)`.
  - **Observed Behavior**: While resilient against unhandled crashes, when `this.storage.setItem` throws `QuotaExceededError`, `this.storage` is not disabled or set to `null`. On every subsequent `setItem` call, it attempts to write to `this.storage`, repeatedly generating and catching DOMExceptions.

### 1.3 Save Package Sanitization & Currency Clamping
- **File**: `src/game/persistence/GameStatePersistence.ts`
  - **Lines 507–558 (`sanitizeMetaProfile`)**:
    - Validates prototype pollution on perk keys:
      ```typescript
      if (
        typeof key !== 'string' ||
        key in Object.prototype ||
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype'
      ) {
        continue;
      }
      ```
    - Clamps perk levels: `sanitizedPerks[key] = Math.max(0, Math.min(numVal, maxLevel))`. Negative perk levels are clamped to 0.
    - Currency sanitization:
      ```typescript
      const safeNumber = (val: unknown, fallback: number): number => {
        if (typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val)) {
          return Math.max(0, Math.floor(val));
        }
        return fallback;
      };
      ```
  - **Observed Defect (SEC-VAL-01)**: `safeNumber` only enforces a lower bound (`Math.max(0, ...)`). It does **NOT** enforce an upper limit / ceiling on `cosmicEssence` or `starCandies`. An imported save package containing `cosmicEssence: 9999999999999` or `starCandies: 1e12` is accepted directly without clamping to the game's economic cap.
  - **Observed Defect (SEC-VAL-02)**: In line 529:
    ```typescript
    const node = Object.prototype.hasOwnProperty.call(CONFECTIONERY_PERKS, key)
      ? CONFECTIONERY_PERKS[key]
      : null;
    const maxLevel = node ? node.maxLevel : 10;
    ```
    If an unknown perk key is present in `p.perks` (e.g. `"hacked_stat": 8`), because `node` is `null`, `maxLevel` defaults to `10` instead of rejecting the unknown perk key.
  - **Observed Defect (SEC-VAL-03)**: In lines 550–554:
    - `unlockedModes`: `filter(isString)` does not validate against `Object.values(GameModeType)`.
    - `equippedRelics` / `discoveredRelics`: `filter(isString)` does not validate against `Object.values(RelicId)`. Moreover, `equippedRelics` is not constrained to `maxRelicSlots` (maximum 2).
    - `highestWaveReached` and `bestSurvivalTimesSeconds`: Raw object references are assigned without deep numerical sanitization.

### 1.4 CircuitBreaker & API 429 Recovery
- **File**: `src/game/persistence/CircuitBreaker.ts`
  - **Lines 112–144 (`calculateBackoffDelay`)**: Parses `Retry-After` header. If absent, applies exponential backoff: `delay = initialBackoffMs * 2^(min(consecutive429-1, 8))`, capped at `maxBackoffMs` (32s), with uniform symmetric jitter (`delay +/- delay * jitterRatio`).
  - **Lines 150–165 (`handleQuotaError`)**: Executes optional `saveFn()` within `try...catch` and transitions breaker state to `CircuitBreakerState.OPEN`.
  - **Lines 285–328 (`drainQueue`)**: Drains offline queued requests sequentially upon successful recovery (`recordSuccess`).
  - **Observed Defect (SEC-NET-01 - Asymmetric 429 Detection)**:
    In `src/game/persistence/GameStatePersistence.ts` (lines 659–663):
    ```typescript
    const is429 =
      error &&
      typeof error === 'object' &&
      (('status' in error && (error as { status: number }).status === 429) ||
        ('statusCode' in error && (error as { statusCode: number }).statusCode === 429));
    ```
    Whereas in `src/game/persistence/CircuitBreaker.ts` (lines 226–239), `isQuotaError` checks:
    ```typescript
    err.status === 429 ||
    err.statusCode === 429 ||
    err.code === 429 ||
    err.code === 'RESOURCE_EXHAUSTED' ||
    (typeof err.message === 'string' &&
      (err.message.includes('429') ||
        err.message.toLowerCase().includes('quota') ||
        err.message.toLowerCase().includes('rate limit')))
    ```
    If an upstream API returns a gRPC status `{ code: 'RESOURCE_EXHAUSTED' }` or `{ code: 429 }` or message containing `"quota"`, `GameStatePersistence.handleApiError` fails to identify it as a 429 error and passes `currentStateProvider` as `undefined` to `recordFailure`. The emergency save is completely bypassed!
  - **Observed Defect (SEC-NET-02 - Stalled Offline Queue / Missing Wakeup Timer)**:
    When the circuit breaker transitions to `OPEN`, it sets `this.nextAttemptTime = Date.now() + backoff`. No `setTimeout` is scheduled to transition the breaker to `HALF_OPEN` or invoke `drainQueue()`. If callers await the resolution of queued requests and dispatch no new requests to `execute()`, the queue stalls in memory indefinitely.

### 1.5 Modal Key Interception & Input Sanitization
- **File**: `src/components/BombermanGame.tsx`
  - **Lines 382–406 (`handleKeyDown`)**:
    ```typescript
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
        return;
      }
      if (!window.mobileInput) return;
      ...
    ```
  - **Lines 408–428 (`handleKeyUp`)**:
    ```typescript
    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
        return;
      }
      if (!window.mobileInput) return;
      ...
    ```
  - **Observed Defect (SEC-UI-01 - Sticky Key Lockout on Input Focus)**:
    If a player holds down a movement key (e.g. `'W'`) or Space, and an input element is focused (or a modal with an input/textarea opens), releasing the key triggers `handleKeyUp`. Because `target.tagName === 'TEXTAREA'` (or `INPUT`), line 410 returns early! `window.mobileInput.up = false` is never executed, causing the character to move indefinitely without player input.
  - **Observed Defect (SEC-UI-02 - Background Input Bleed During Modal Display)**:
    Modals in `BombermanGame.tsx` (`isPerkModalOpen`, `isRelicModalOpen`, `isExportImportModalOpen`) do not guard `handleKeyDown`. When a modal is open and the user clicks on non-input elements (e.g. Perk nodes, Relic cards, modal container), `target.tagName` is `DIV` or `BUTTON`. If the user presses WASD, Space, Shift, E, R, or Q, the background game continues moving the player, placing bombs, and casting ultimates.
  - **Observed Defect (SEC-UI-03 - Missing Escape Key Modal Dismissal & Window Blur Reset)**:
    There is no `Escape` key handler to dismiss active modals. Additionally, there is no `blur` or `visibilitychange` listener on `window` to zero out `window.mobileInput` if the user switches tabs or applications while pressing movement keys.

---

## 2. Logic Chain

1. **Premise 1 (Checksum & RLE Invariants)**:
   - Observation 1.1 confirms that map data is compressed via `compressGrid` and verified via `calculateChecksum` / `verifyChecksum` prior to decompression.
   - Because `calculateChecksum` is salted and executes in constant time (lines 285–296), bit-level tampering in `sessionStorage` or JSON save files is detected and rejected without side-channel leaks.

2. **Premise 2 (Storage Failure Resilience)**:
   - Observation 1.2 demonstrates that `WebStorageAdapter` catches `QuotaExceededError` and immediately stores data in `MemoryStorageAdapter`.
   - Observation 1.2 also reveals that because `this.storage` is not disabled upon catching a quota error, subsequent writes will repeatedly throw and catch DOMExceptions.

3. **Premise 3 (Save Package Sanitization Gaps)**:
   - Observation 1.3 shows that `sanitizeMetaProfile` filters prototype pollution keys (`__proto__`, `constructor`, `prototype`).
   - However, Observation 1.3 (SEC-VAL-01, SEC-VAL-02, SEC-VAL-03) proves that currency values lack an upper bound (`Math.min`), unknown perks default to `maxLevel = 10`, and mode/relic arrays allow arbitrary string values. An attacker who imports a crafted save file can inflate currencies to `Number.MAX_SAFE_INTEGER` and corrupt mode/relic states.

4. **Premise 4 (Circuit Breaker State Machine & Deadlock Risks)**:
   - Observation 1.4 (SEC-NET-01) proves an inconsistency between `GameStatePersistence.handleApiError` (which checks only `status === 429 || statusCode === 429`) and `CircuitBreaker.isQuotaError` (which checks `RESOURCE_EXHAUSTED` and error messages). This leads to emergency state saves being skipped when encountering gRPC quota errors.
   - Observation 1.4 (SEC-NET-02) proves that when the breaker enters `OPEN`, no timer triggers auto-recovery. If the application stops sending requests while awaiting queued promises, the queue remains stalled.

5. **Premise 5 (Input State & Modal Concurrency)**:
   - Observation 1.5 (SEC-UI-01) shows that skipping `handleKeyUp` when focused on an input causes sticky key state. Releasing a key must always clear `mobileInput`, regardless of event target.
   - Observation 1.5 (SEC-UI-02) shows that modal dialogs lack an input lock, causing background gameplay actions while modals are open.

---

## 3. Caveats

- **Caveat 1 (Server-Side Remote Sync)**: The current architecture utilizes client-side WebStorage (`localStorage` and `sessionStorage`) with manual JSON export/import. If a real backend server (e.g. Firebase or REST API) is connected in the future, the `CircuitBreaker` will govern live network requests; currently, it protects local simulations and potential cloud saves.
- **Caveat 2 (GameScene Run State Rehydration)**: When `handleResumeRun` is called, `BombermanGame.tsx` emits `resume-run-state` to Phaser. In `GameScene.ts` (lines 646–649), `onResumeRunState` only calls `this.emitStatsUpdate()`. Full dynamic reconstruction of active in-flight bombs and spawned enemies on a resumed stage is not yet implemented in `GameScene`.

---

## 4. Conclusion

The state persistence and security architecture provides a strong foundation:
- RLE map compression is compact and mathematically verified with 0 loss.
- 24-character canonical checksums (FNV-1a + DJB2) effectively block state tampering and run injection.
- Constant-time verification prevents timing attacks.
- Dual-tier storage degrades silently to memory without unhandled crashes.

However, five specific vulnerabilities and edge-case defects were identified that require remediation:
1. **SEC-VAL-01**: Missing upper-bound clamping on currencies (`cosmicEssence`, `starCandies`) in `sanitizeMetaProfile`.
2. **SEC-VAL-02**: Unknown perk keys default to `maxLevel = 10` rather than being discarded.
3. **SEC-VAL-03**: `unlockedModes`, `discoveredRelics`, and `equippedRelics` lack enum-whitelist validation, and `equippedRelics` can exceed the 2-slot cap.
4. **SEC-NET-01**: Inconsistent 429 quota detection between `GameStatePersistence.handleApiError` and `CircuitBreaker.ts`, skipping emergency saves on gRPC/SDK quota exceptions.
5. **SEC-NET-02**: Missing auto-wakeup timer in `CircuitBreaker` for `OPEN -> HALF_OPEN` transitions, risking an offline queue deadlock.
6. **SEC-UI-01 & SEC-UI-02**: Modal key interception flaws allowing sticky movement keys when focusing inputs, and background gameplay input bleed when modals are open.

---

## 5. Verification Method & Proposed Remediation

### 5.1 Verification Commands
Run all test suites and linting checks:
```bash
# 1. Run persistence and chaos resilience suites
node --test tests/persistence.test.mjs tests/chaos_resilience.test.mjs

# 2. Run full regression test suite (644 tests)
npm test

# 3. Check for any lint violations
npm run lint

# 4. Verify clean production build
npm run build
```

### 5.2 Concrete Remediation Steps

#### Remediation 1: Currency Clamping & Whitelist Validation in `sanitizeMetaProfile`
In `src/game/persistence/GameStatePersistence.ts`:
```typescript
// Define safe currency cap
const MAX_SAFE_CURRENCY = 999_999;

// In sanitizeMetaProfile:
const safeNumber = (val: unknown, fallback: number): number => {
  if (typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val)) {
    return Math.max(0, Math.min(Math.floor(val), MAX_SAFE_CURRENCY));
  }
  return fallback;
};

// Discard unknown perk keys:
for (const [key, val] of Object.entries(p.perks as Record<string, unknown>)) {
  if (
    typeof key !== 'string' ||
    key in Object.prototype ||
    key === '__proto__' ||
    key === 'constructor' ||
    key === 'prototype'
  ) {
    continue;
  }
  const node = Object.prototype.hasOwnProperty.call(CONFECTIONERY_PERKS, key)
    ? CONFECTIONERY_PERKS[key]
    : null;
  if (!node) continue; // Reject unknown perk keys
  const maxLevel = node.maxLevel;
  const numVal = typeof val === 'number' && Number.isFinite(val) ? Math.floor(val) : 0;
  sanitizedPerks[key] = Math.max(0, Math.min(numVal, maxLevel));
}

// Whitelist validate modes and relics:
const validModes = new Set(Object.values(GameModeType));
const validRelics = new Set(Object.values(RelicId));

const sanitizedModes = Array.isArray(p.unlockedModes)
  ? (p.unlockedModes as unknown[]).filter((m): m is GameModeType => typeof m === 'string' && validModes.has(m as GameModeType))
  : defaultProfile.unlockedModes;
if (!sanitizedModes.includes(GameModeType.STANDARD)) {
  sanitizedModes.unshift(GameModeType.STANDARD);
}

const sanitizedEquippedRelics = Array.isArray(p.equippedRelics)
  ? (p.equippedRelics as unknown[])
      .filter((r): r is RelicId => typeof r === 'string' && validRelics.has(r as RelicId))
      .slice(0, 2)
  : defaultProfile.equippedRelics;
```

#### Remediation 2: Unify 429 Quota Detection & Auto-Wakeup Timer
In `src/game/persistence/GameStatePersistence.ts`:
```typescript
// Use CircuitBreaker's comprehensive quota error detector
public async handleApiError(
  error: unknown,
  currentStateProvider?: () => SerializedRunState | null
): Promise<void> {
  const is429 = this.circuitBreaker['isQuotaError'](error);
  if (is429) {
    const emergencySave = () => {
      const state = currentStateProvider ? currentStateProvider() : this.cachedActiveRun;
      if (state) {
        state.saveTrigger = 'quota_429';
        this.saveRunState(state);
      }
    };
    this.circuitBreaker.handleQuotaError(emergencySave, error);
  } else {
    this.circuitBreaker.recordFailure(error);
  }
}
```

In `src/game/persistence/CircuitBreaker.ts`:
```typescript
// In handleQuotaError, schedule auto-recovery:
if (this.retryTimer) {
  clearTimeout(this.retryTimer as NodeJS.Timeout);
  this.retryTimer = null;
}
this.retryTimer = setTimeout(() => {
  this.retryTimer = null;
  if (this.state === CircuitBreakerState.OPEN) {
    this.setState(CircuitBreakerState.HALF_OPEN);
    if (this.offlineQueue.length > 0) {
      void this.drainQueue();
    }
  }
}, backoff);
```

#### Remediation 3: Modal Key Interception & Sticky Key Fix
In `src/components/BombermanGame.tsx`:
```typescript
// 1. In handleKeyDown: suppress movement hotkeys when any modal is open
const isAnyModalOpen = isPerkModalOpen || isRelicModalOpen || isExportImportModalOpen;
if (isAnyModalOpen) {
  if (e.key === 'Escape') {
    setIsPerkModalOpen(false);
    setIsRelicModalOpen(false);
    setIsExportImportModalOpen(false);
  }
  return;
}

// 2. In handleKeyUp: ALWAYS clear mobileInput key, regardless of target element
const handleKeyUp = (e: KeyboardEvent) => {
  if (!window.mobileInput) return;
  const key = e.key.toLowerCase();
  if (key === 'w' || key === 'arrowup') window.mobileInput.up = false;
  if (key === 's' || key === 'arrowdown') window.mobileInput.down = false;
  if (key === 'a' || key === 'arrowleft') window.mobileInput.left = false;
  if (key === 'd' || key === 'arrowright') window.mobileInput.right = false;
  if (key === ' ' || e.code === 'Space') window.mobileInput.bomb = false;
  if (key === 'shift' || key === 'e') window.mobileInput.dash = false;
  if (key === 'r' || key === 'q') window.mobileInput.ultimate = false;
};

// 3. Reset mobileInput when window loses focus
const resetAllInputs = () => {
  if (window.mobileInput) {
    window.mobileInput = { up: false, down: false, left: false, right: false, bomb: false, dash: false, ultimate: false };
  }
};
window.addEventListener('blur', resetAllInputs);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) resetAllInputs();
});
```

### 5.3 Invalidation Conditions
This report is invalidated if:
1. `STORAGE_SCHEMA_VERSION` is updated without updating the checksum salt or canonical serialiser.
2. The concurrency model of `CircuitBreaker` is modified without testing simultaneous queue drains under HTTP 429 conditions.
3. React modal state transitions are restructured into separate routing paths without maintaining input state hygiene.
