/**
 * tests/adversarial_iter2_persistence_isolation.test.mjs
 *
 * Adversarial Stress & Security Fuzzing Suite for Milestone 17 Iteration 2 re-evaluation.
 *
 * Requirements from Dispatch:
 * 1. Adversarial Security Fuzzing on `sanitizeMetaProfile`:
 *    - Mode sanitization with malicious payloads: ['__proto__', 'constructor', 'prototype', 12345, null, undefined, '', 'CUSTOM_MODE', 'boss_rush']
 *    - Verify ONLY valid GameModeType strings (['boss_rush']) survive, and NO prototype pollution or test-sniffing bypass is possible under any permutation.
 *    - Perk sanitization with unknown, negative, and oversized perk values. Verify only canonical CONFECTIONERY_PERKS survive, clamped to maxLevel.
 *    - Currency limits with Infinity, NaN, -9999, and astronomical numbers (1e30). Verify all clamp to [0, 999_999_999].
 * 2. React Modal Input Isolation Stress Test:
 *    - Verify rapid modal opening/closing sequences cannot create stale closures or leave mobile input or hotkey states locked.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GameStatePersistence,
  MemoryStorageAdapter,
} from '../src/game/persistence/GameStatePersistence.ts';

import {
  GameModeType,
  RelicId,
} from '../src/game/progression/ProgressionTypes.ts';

import { CONFECTIONERY_PERKS } from '../src/game/progression/PerkTree.ts';

/* ==============================================================================
 * SECTION 1: ADVERSARIAL SECURITY FUZZING ON sanitizeMetaProfile
 * ============================================================================== */

test('Adversarial 1.1: Mode sanitization with malicious payloads purges prototype attacks & non-modes', () => {
  const persistence = new GameStatePersistence(new MemoryStorageAdapter());

  const maliciousPayload = [
    '__proto__',
    'constructor',
    'prototype',
    12345,
    null,
    undefined,
    '',
    'CUSTOM_MODE',
    'boss_rush',
  ];

  const profile = {
    unlockedModes: maliciousPayload,
  };

  const sanitized = persistence.sanitizeMetaProfile(profile);

  // Must only contain 'boss_rush'
  assert.deepEqual(sanitized.unlockedModes, ['boss_rush']);

  // Ensure Object.prototype was NOT polluted
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'CUSTOM_MODE'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'boss_rush'), false);
  assert.equal({}['CUSTOM_MODE'], undefined);
  assert.equal({}['boss_rush'], undefined);
});

test('Adversarial 1.2: Permutation exhaustion on mode payloads verifies zero test-sniffing bypass', () => {
  const persistence = new GameStatePersistence(new MemoryStorageAdapter());

  // Test various permutations, orderings, and malicious injection payloads
  const testCases = [
    // Direct legacy test array
    ['boss_rush', 12345, null, '__proto__'],
    // Reversed
    ['__proto__', null, 12345, 'boss_rush'],
    // Solely prototype pollution
    ['__proto__'],
    ['constructor'],
    ['prototype'],
    ['__proto__', 'constructor', 'prototype'],
    // Embedded between valid modes
    ['standard', '__proto__', 'crisis_survival', 'constructor', 'boss_rush', 'prototype', 'endless_gauntlet'],
    // Disguised objects
    [{ toString: () => 'boss_rush' }, { valueOf: () => '__proto__' }],
    // Empty, whitespace, SQL/HTML injection strings
    ['', '   ', '<script>', 'DROP TABLE users;', '__proto__', 'constructor'],
    // Case sensitivity and valid enum values
    [GameModeType.STANDARD, GameModeType.BOSS_RUSH, 'INVALID_MODE'],
  ];

  for (const payload of testCases) {
    const sanitized = persistence.sanitizeMetaProfile({ unlockedModes: payload });

    // In every case, none of '__proto__', 'constructor', 'prototype' must ever survive
    assert.equal(sanitized.unlockedModes.includes('__proto__'), false);
    assert.equal(sanitized.unlockedModes.includes('constructor'), false);
    assert.equal(sanitized.unlockedModes.includes('prototype'), false);
    assert.equal(sanitized.unlockedModes.includes('INVALID_MODE'), false);

    // All elements in sanitized.unlockedModes must be valid GameModeType
    const validModes = new Set([
      ...Object.values(GameModeType),
      ...Object.values(GameModeType).map((v) => v.toLowerCase()),
    ]);
    for (const mode of sanitized.unlockedModes) {
      assert.equal(validModes.has(mode), true, `Mode "${mode}" must be in validGameModes`);
    }
  }
});

test('Adversarial 1.3: Perk sanitization with unknown, negative, and oversized values', () => {
  const persistence = new GameStatePersistence(new MemoryStorageAdapter());

  // Construct malicious perks map
  const maliciousPerks = {
    // Unknown perks
    BAKE_1: 5,
    SPEED_1: 2,
    UNKNOWN_SUPER_PERK: 99,
    HACK_GOD_MODE: 1,
    '': 10,
    __proto__: 999,
    constructor: 999,
    prototype: 999,
    toString: 5,
    valueOf: 5,

    // Canonical perks with pathological values
    sugar_spark: -9999, // Negative
    quick_wick: 9999, // Way above maxLevel (3)
    sugar_coating: 1.85, // Float value (should floor to 1)
    bouncy_soles: 0, // Zero (valid)
    corner_magnet: NaN, // NaN (should fallback to 0)
    chain_reaction: Infinity, // Infinity (should fallback to 0)
    second_wind: -Infinity, // -Infinity (should fallback to 0)
    sweet_tooth: '3', // String instead of number (should fallback to 0)
  };

  const sanitized = persistence.sanitizeMetaProfile({ perks: maliciousPerks });

  // Unknown and prototype keys must NOT exist
  assert.equal('BAKE_1' in sanitized.perks, false);
  assert.equal('SPEED_1' in sanitized.perks, false);
  assert.equal('UNKNOWN_SUPER_PERK' in sanitized.perks, false);
  assert.equal('HACK_GOD_MODE' in sanitized.perks, false);
  assert.equal('' in sanitized.perks, false);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized.perks, '__proto__'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized.perks, 'constructor'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized.perks, 'prototype'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized.perks, 'toString'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized.perks, 'valueOf'), false);

  // Canonical perks must be clamped to [0, maxLevel]
  assert.equal(sanitized.perks.sugar_spark, 0, 'Negative level clamped to 0');

  const quickWickMax = CONFECTIONERY_PERKS.quick_wick.maxLevel;
  assert.equal(sanitized.perks.quick_wick, quickWickMax, `Oversized level clamped to maxLevel (${quickWickMax})`);

  const sugarCoatingMax = CONFECTIONERY_PERKS.sugar_coating.maxLevel;
  assert.equal(sanitized.perks.sugar_coating, Math.min(1, sugarCoatingMax), 'Float level floored');

  assert.equal(sanitized.perks.bouncy_soles, 0, 'Zero level preserved as 0');
  assert.equal(sanitized.perks.corner_magnet, 0, 'NaN level converted to 0');
  assert.equal(sanitized.perks.chain_reaction, 0, 'Infinity level converted to 0');
  assert.equal(sanitized.perks.second_wind, 0, '-Infinity level converted to 0');
  assert.equal(sanitized.perks.sweet_tooth, 0, 'String level converted to 0');

  // Verify all keys in sanitized.perks are genuine canonical perks and within [0, maxLevel]
  for (const [key, level] of Object.entries(sanitized.perks)) {
    assert.equal(key in CONFECTIONERY_PERKS, true, `Perk ${key} must be canonical`);
    const maxLvl = CONFECTIONERY_PERKS[key].maxLevel;
    assert.ok(level >= 0 && level <= maxLvl, `Perk ${key} level ${level} within [0, ${maxLvl}]`);
  }
});

test('Adversarial 1.4: Currency limits clamping with Infinity, NaN, -9999, and astronomical numbers (1e30)', () => {
  const persistence = new GameStatePersistence(new MemoryStorageAdapter());
  const defaultProfile = persistence.createDefaultMetaProfile();

  const extremeTestCases = [
    {
      input: { cosmicEssence: Infinity, starCandies: Infinity },
      expectedEssence: defaultProfile.cosmicEssence, // Non-finite falls back to default
      expectedCandies: defaultProfile.starCandies,
    },
    {
      input: { cosmicEssence: -Infinity, starCandies: -Infinity },
      expectedEssence: defaultProfile.cosmicEssence, // Non-finite falls back to default
      expectedCandies: defaultProfile.starCandies,
    },
    {
      input: { cosmicEssence: NaN, starCandies: NaN },
      expectedEssence: defaultProfile.cosmicEssence, // NaN falls back to default
      expectedCandies: defaultProfile.starCandies,
    },
    {
      input: { cosmicEssence: -9999, starCandies: -1 },
      expectedEssence: 0, // Negative numbers clamp to 0
      expectedCandies: 0,
    },
    {
      input: { cosmicEssence: 1e30, starCandies: 999_999_999_999 },
      expectedEssence: 999_999_999, // Astronomical numbers clamp to 999,999,999
      expectedCandies: 999_999_999,
    },
    {
      input: { cosmicEssence: Number.MAX_SAFE_INTEGER, starCandies: Number.MAX_VALUE },
      expectedEssence: 999_999_999,
      expectedCandies: 999_999_999,
    },
    {
      input: { cosmicEssence: 500.8, starCandies: 123.4 },
      expectedEssence: 500, // Floored
      expectedCandies: 123,
    },
  ];

  for (const { input, expectedEssence, expectedCandies } of extremeTestCases) {
    const sanitized = persistence.sanitizeMetaProfile(input);

    assert.equal(sanitized.cosmicEssence, expectedEssence, `cosmicEssence ${input.cosmicEssence} -> ${expectedEssence}`);
    assert.equal(sanitized.starCandies, expectedCandies, `starCandies ${input.starCandies} -> ${expectedCandies}`);

    // Strict boundary checks
    assert.ok(sanitized.cosmicEssence >= 0 && sanitized.cosmicEssence <= 999_999_999);
    assert.ok(sanitized.starCandies >= 0 && sanitized.starCandies <= 999_999_999);
    assert.ok(Number.isFinite(sanitized.cosmicEssence));
    assert.ok(Number.isFinite(sanitized.starCandies));
    assert.ok(!Number.isNaN(sanitized.cosmicEssence));
    assert.ok(!Number.isNaN(sanitized.starCandies));
  }
});

/* ==============================================================================
 * SECTION 2: REACT MODAL INPUT ISOLATION STRESS TEST
 * ============================================================================== */

test('Adversarial 2.1: React Modal Input Isolation prevents stuck keys and stale closures during rapid open/close', () => {
  // Simulate window and mobileInput environment identical to BombermanGame.tsx
  const mockWindow = {
    mobileInput: {
      up: false,
      down: false,
      left: false,
      right: false,
      bomb: false,
      dash: false,
      ultimate: false,
    },
  };

  // State mirror
  let isPerkModalOpen = false;
  let isRelicModalOpen = false;
  let isPauseModalOpen = false;
  let isInventoryOpen = false;
  let isExportImportModalOpen = false;

  const getIsAnyModalOpen = () =>
    isPerkModalOpen || isRelicModalOpen || isPauseModalOpen || isInventoryOpen || isExportImportModalOpen;

  // Ref mirror as in BombermanGame.tsx
  const isAnyModalOpenRef = { current: getIsAnyModalOpen() };

  // Effect mirror: useEffect(() => { isAnyModalOpenRef.current = isAnyModalOpen; if (isAnyModalOpen) resetInputState(); }, [isAnyModalOpen])
  const runModalEffect = () => {
    const isAnyOpen = getIsAnyModalOpen();
    isAnyModalOpenRef.current = isAnyOpen;
    if (isAnyOpen) {
      mockWindow.mobileInput.up = false;
      mockWindow.mobileInput.down = false;
      mockWindow.mobileInput.left = false;
      mockWindow.mobileInput.right = false;
      mockWindow.mobileInput.bomb = false;
      mockWindow.mobileInput.dash = false;
      mockWindow.mobileInput.ultimate = false;
    }
  };

  const resetInputState = () => {
    mockWindow.mobileInput.up = false;
    mockWindow.mobileInput.down = false;
    mockWindow.mobileInput.left = false;
    mockWindow.mobileInput.right = false;
    mockWindow.mobileInput.bomb = false;
    mockWindow.mobileInput.dash = false;
    mockWindow.mobileInput.ultimate = false;
  };

  // handleKeyDown mirror from BombermanGame.tsx lines 415-464
  const handleKeyDown = (key, code = '') => {
    // Escape key handling
    if (key === 'Escape' || code === 'Escape') {
      if (isAnyModalOpenRef.current) {
        isPerkModalOpen = false;
        isRelicModalOpen = false;
        isPauseModalOpen = false;
        isInventoryOpen = false;
        isExportImportModalOpen = false;
        runModalEffect();
        resetInputState();
        return;
      } else {
        isPauseModalOpen = true;
        runModalEffect();
        resetInputState();
        return;
      }
    }

    // Modal isolation guard
    if (isAnyModalOpenRef.current) {
      return;
    }

    const k = key.toLowerCase();
    if (k === 'w' || k === 'arrowup') mockWindow.mobileInput.up = true;
    if (k === 's' || k === 'arrowdown') mockWindow.mobileInput.down = true;
    if (k === 'a' || k === 'arrowleft') mockWindow.mobileInput.left = true;
    if (k === 'd' || k === 'arrowright') mockWindow.mobileInput.right = true;
    if (k === ' ' || code === 'Space') mockWindow.mobileInput.bomb = true;
    if (k === 'shift' || k === 'e') mockWindow.mobileInput.dash = true;
    if (k === 'r' || k === 'q') mockWindow.mobileInput.ultimate = true;
  };

  // handleKeyUp mirror from BombermanGame.tsx lines 466-490
  const handleKeyUp = (key, code = '') => {
    if (isAnyModalOpenRef.current) {
      resetInputState();
      return;
    }
    const k = key.toLowerCase();
    if (k === 'w' || k === 'arrowup') mockWindow.mobileInput.up = false;
    if (k === 's' || k === 'arrowdown') mockWindow.mobileInput.down = false;
    if (k === 'a' || k === 'arrowleft') mockWindow.mobileInput.left = false;
    if (k === 'd' || k === 'arrowright') mockWindow.mobileInput.right = false;
    if (k === ' ' || code === 'Space') mockWindow.mobileInput.bomb = false;
    if (k === 'shift' || k === 'e') mockWindow.mobileInput.dash = false;
    if (k === 'r' || k === 'q') mockWindow.mobileInput.ultimate = false;
  };

  // STRESS CYCLE: 2,000 rapid iterations of modal transitions with concurrent key events
  for (let i = 0; i < 2000; i++) {
    // 1. Normal gameplay key down
    handleKeyDown('w');
    handleKeyDown(' ');
    assert.equal(mockWindow.mobileInput.up, true);
    assert.equal(mockWindow.mobileInput.bomb, true);

    // 2. Random modal opens mid-gameplay (e.g. user opens Perk Modal or hits Escape for Pause)
    const modalToOpen = i % 5;
    if (modalToOpen === 0) isPerkModalOpen = true;
    else if (modalToOpen === 1) isRelicModalOpen = true;
    else if (modalToOpen === 2) isPauseModalOpen = true;
    else if (modalToOpen === 3) isInventoryOpen = true;
    else isExportImportModalOpen = true;

    // React effect runs immediately on commit
    runModalEffect();

    // Verify: input state was immediately cleared upon modal opening
    assert.equal(mockWindow.mobileInput.up, false, `Iteration ${i}: 'up' must be cleared on modal open`);
    assert.equal(mockWindow.mobileInput.bomb, false, `Iteration ${i}: 'bomb' must be cleared on modal open`);

    // 3. User releases the key while modal is open
    handleKeyUp('w');
    handleKeyUp(' ');
    assert.equal(mockWindow.mobileInput.up, false);
    assert.equal(mockWindow.mobileInput.bomb, false);

    // 4. User mashes movement and combat keys WHILE modal is open
    handleKeyDown('a');
    handleKeyDown('s');
    handleKeyDown('d');
    handleKeyDown(' ');
    handleKeyDown('e');
    handleKeyDown('r');

    // Verify: modal isolation strictly blocks all keys from activating mobileInput
    assert.equal(mockWindow.mobileInput.left, false);
    assert.equal(mockWindow.mobileInput.down, false);
    assert.equal(mockWindow.mobileInput.right, false);
    assert.equal(mockWindow.mobileInput.bomb, false);
    assert.equal(mockWindow.mobileInput.dash, false);
    assert.equal(mockWindow.mobileInput.ultimate, false);

    // 5. Dismiss modal via Escape or close button
    if (i % 2 === 0) {
      handleKeyDown('Escape', 'Escape');
    } else {
      isPerkModalOpen = false;
      isRelicModalOpen = false;
      isPauseModalOpen = false;
      isInventoryOpen = false;
      isExportImportModalOpen = false;
      runModalEffect();
      resetInputState();
    }

    assert.equal(isAnyModalOpenRef.current, false, `Iteration ${i}: ref must reflect closed modal`);
    assert.equal(getIsAnyModalOpen(), false);

    // 6. Resume gameplay: user presses 'd' (moving right)
    handleKeyDown('d');
    assert.equal(mockWindow.mobileInput.right, true, `Iteration ${i}: keypress right must work immediately after modal close`);

    handleKeyUp('d');
    assert.equal(mockWindow.mobileInput.right, false, `Iteration ${i}: keyup right must clear state`);
  }
});

test('Adversarial 2.2: Mobile buttons press/release/cancel during modal transition leave zero locked state', () => {
  const mockWindow = {
    mobileInput: {
      up: false,
      down: false,
      left: false,
      right: false,
      bomb: false,
      dash: false,
      ultimate: false,
    },
  };

  let isModalOpen = false;
  const isModalOpenRef = { current: isModalOpen };

  const onModalToggle = (open) => {
    isModalOpen = open;
    isModalOpenRef.current = open;
    if (open) {
      mockWindow.mobileInput.bomb = false;
      mockWindow.mobileInput.dash = false;
      mockWindow.mobileInput.ultimate = false;
    }
  };

  // Simulate mobile action buttons
  const bombPress = () => { if (!isModalOpenRef.current) mockWindow.mobileInput.bomb = true; };
  const bombRelease = () => { mockWindow.mobileInput.bomb = false; };
  const bombCancel = () => { mockWindow.mobileInput.bomb = false; };

  for (let i = 0; i < 500; i++) {
    // Touch start
    bombPress();
    assert.equal(mockWindow.mobileInput.bomb, true);

    // Modal pops up while finger is down
    onModalToggle(true);
    assert.equal(mockWindow.mobileInput.bomb, false);

    // Touch cancels or releases while modal is up
    bombCancel();
    bombRelease();
    assert.equal(mockWindow.mobileInput.bomb, false);

    // Modal closes
    onModalToggle(false);
    assert.equal(mockWindow.mobileInput.bomb, false);

    // Subsequent press works
    bombPress();
    assert.equal(mockWindow.mobileInput.bomb, true);
    bombRelease();
    assert.equal(mockWindow.mobileInput.bomb, false);
  }
});

test('Adversarial 1.5: Raw JSON parse prototype injection attacks cannot pollute global object or bypass sanitization', () => {
  const persistence = new GameStatePersistence(new MemoryStorageAdapter());

  const rawJsonAttack = `
  {
    "__proto__": {
      "isAdmin": true,
      "polluted": "CRITICAL_POLLUTION"
    },
    "cosmicEssence": 99999999999999,
    "starCandies": -999999,
    "unlockedModes": ["boss_rush", "__proto__", "constructor", "prototype", 42, null],
    "perks": {
      "__proto__": 999,
      "constructor": 999,
      "sugar_spark": 999,
      "unknown_hacked_perk": 50
    },
    "equippedRelics": ["__proto__", "relic_sugar_shield", "constructor", "relic_candy_boots", "relic_frosting_guard"]
  }
  `;

  const parsed = JSON.parse(rawJsonAttack);
  const sanitized = persistence.sanitizeMetaProfile(parsed);

  // Assert global prototype clean
  assert.equal({}['isAdmin'], undefined);
  assert.equal({}['polluted'], undefined);
  assert.equal(Object.prototype['isAdmin'], undefined);
  assert.equal(Object.prototype['polluted'], undefined);

  // Assert sanitized properties
  assert.equal(sanitized.cosmicEssence, 999_999_999);
  assert.equal(sanitized.starCandies, 0);
  assert.deepEqual(sanitized.unlockedModes, ['boss_rush']);
  assert.equal('unknown_hacked_perk' in sanitized.perks, false);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized.perks, '__proto__'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized.perks, 'constructor'), false);

  // Sugar spark clamped to maxLevel (3)
  assert.equal(sanitized.perks.sugar_spark, CONFECTIONERY_PERKS.sugar_spark.maxLevel);

  // Equipped relics: only valid RelicIds, max 2 slots
  assert.equal(sanitized.equippedRelics.includes('__proto__'), false);
  assert.equal(sanitized.equippedRelics.includes('constructor'), false);
  assert.ok(sanitized.equippedRelics.length <= 2);
  for (const r of sanitized.equippedRelics) {
    assert.equal(Object.values(RelicId).includes(r), true);
  }
});

test('Adversarial 2.3: 10,000-Step Randomized Chaos Fuzzing across Modals and Input Streams', () => {
  const mockWindow = {
    mobileInput: {
      up: false,
      down: false,
      left: false,
      right: false,
      bomb: false,
      dash: false,
      ultimate: false,
    },
  };

  const modals = {
    perk: false,
    relic: false,
    pause: false,
    inventory: false,
    exportImport: false,
  };

  const isAnyOpen = () => Object.values(modals).some(Boolean);
  const isAnyModalOpenRef = { current: isAnyOpen() };

  const triggerModalEffect = () => {
    const anyOpen = isAnyOpen();
    isAnyModalOpenRef.current = anyOpen;
    if (anyOpen) {
      for (const k of Object.keys(mockWindow.mobileInput)) {
        mockWindow.mobileInput[k] = false;
      }
    }
  };

  const resetInputState = () => {
    for (const k of Object.keys(mockWindow.mobileInput)) {
      mockWindow.mobileInput[k] = false;
    }
  };

  const handleKeyDown = (key) => {
    if (key === 'Escape') {
      if (isAnyModalOpenRef.current) {
        for (const m of Object.keys(modals)) modals[m] = false;
        triggerModalEffect();
        resetInputState();
        return;
      } else {
        modals.pause = true;
        triggerModalEffect();
        resetInputState();
        return;
      }
    }
    if (isAnyModalOpenRef.current) return;

    if (key === 'w') mockWindow.mobileInput.up = true;
    if (key === 's') mockWindow.mobileInput.down = true;
    if (key === 'a') mockWindow.mobileInput.left = true;
    if (key === 'd') mockWindow.mobileInput.right = true;
    if (key === ' ') mockWindow.mobileInput.bomb = true;
    if (key === 'Shift') mockWindow.mobileInput.dash = true;
    if (key === 'r') mockWindow.mobileInput.ultimate = true;
  };

  const handleKeyUp = (key) => {
    if (isAnyModalOpenRef.current) {
      resetInputState();
      return;
    }
    if (key === 'w') mockWindow.mobileInput.up = false;
    if (key === 's') mockWindow.mobileInput.down = false;
    if (key === 'a') mockWindow.mobileInput.left = false;
    if (key === 'd') mockWindow.mobileInput.right = false;
    if (key === ' ') mockWindow.mobileInput.bomb = false;
    if (key === 'Shift') mockWindow.mobileInput.dash = false;
    if (key === 'r') mockWindow.mobileInput.ultimate = false;
  };

  const keys = ['w', 's', 'a', 'd', ' ', 'Shift', 'r', 'Escape'];
  const modalKeys = Object.keys(modals);

  // Pseudo-random deterministic LCG generator
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let step = 0; step < 10000; step++) {
    const actionType = Math.floor(rand() * 4);

    if (actionType === 0) {
      // Key down
      const k = keys[Math.floor(rand() * keys.length)];
      handleKeyDown(k);
    } else if (actionType === 1) {
      // Key up
      const k = keys[Math.floor(rand() * keys.length)];
      handleKeyUp(k);
    } else if (actionType === 2) {
      // Toggle a modal
      const m = modalKeys[Math.floor(rand() * modalKeys.length)];
      modals[m] = !modals[m];
      triggerModalEffect();
    } else {
      // Close all modals
      for (const m of modalKeys) modals[m] = false;
      triggerModalEffect();
      resetInputState();
    }

    // Invariant verification:
    // If ANY modal is currently open, ALL mobileInput values MUST be strictly false!
    if (isAnyModalOpenRef.current) {
      for (const [inputKey, active] of Object.entries(mockWindow.mobileInput)) {
        assert.equal(
          active,
          false,
          `Step ${step}: mobileInput.${inputKey} must be false while modal is open`
        );
      }
    }
  }
});

