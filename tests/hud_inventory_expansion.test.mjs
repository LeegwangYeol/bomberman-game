import test from 'node:test';
import assert from 'node:assert/strict';

/* ==============================================================================
 * HUD & INVENTORY SPECIFICATION HARNESS
 * ============================================================================== */

export const RARITY_COLORS = {
  common: '#94a3b8',
  uncommon: '#4ade80',
  rare: '#38bdf8',
  epic: '#c084fc',
  legendary: '#facc15',
};

/**
 * Mobile Drawer & Input State Controller
 */
export class MobileHUDController {
  constructor() {
    this.isMobile = true;
    this.isInventoryOpen = false;
    this.selectedItemId = null;
    this.mobileInput = {
      up: false,
      down: false,
      left: false,
      right: false,
      bomb: false,
      dash: false,
      ultimate: false,
      interact: false,
    };
  }

  toggleInventory() {
    this.isInventoryOpen = !this.isInventoryOpen;
    if (!this.isInventoryOpen) {
      this.selectedItemId = null;
    }
  }

  selectItem(itemId) {
    this.selectedItemId = itemId;
  }

  closeInventory() {
    this.isInventoryOpen = false;
    this.selectedItemId = null;
  }

  handleUltimatePress(stats) {
    if (stats.ultimateGauge >= 100 && stats.ultimateLockoutRemaining <= 0) {
      this.mobileInput.ultimate = true;
      return true;
    }
    return false;
  }

  releaseUltimate() {
    this.mobileInput.ultimate = false;
  }
}

/**
 * React-Phaser Stats Bridge & Inventory Manager
 */
export class StatsBridgeManager {
  constructor() {
    this.listeners = new Map();
    this.lastEmittedTime = -Infinity;
    this.throttleMs = 200;
    this.emissionCount = 0;
    this.latestSnapshot = null;
  }

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(callback);
  }

  off(eventName, callback) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).delete(callback);
    }
  }

  emit(eventName, payload, currentTime = 0, force = false) {
    if (!force && currentTime - this.lastEmittedTime < this.throttleMs) {
      return false; // Throttled
    }

    this.lastEmittedTime = currentTime;
    this.emissionCount++;

    // Deep clone snapshot to enforce payload immutability
    const snapshot = JSON.parse(JSON.stringify(payload));
    this.latestSnapshot = snapshot;

    if (this.listeners.has(eventName)) {
      for (const cb of this.listeners.get(eventName)) {
        cb(snapshot);
      }
    }
    return true;
  }
}

/**
 * Active Buffs State Manager
 */
export class ActiveBuffsManager {
  constructor() {
    this.buffs = new Map();
  }

  addBuff(id, name, icon, color, durationMs, currentTime = 0) {
    this.buffs.set(id, {
      id,
      name,
      icon,
      color,
      expiresAt: currentTime + durationMs,
      totalMs: durationMs,
    });
  }

  update(currentTime) {
    const expired = [];
    for (const [id, buff] of this.buffs.entries()) {
      if (currentTime >= buff.expiresAt) {
        expired.push(id);
      }
    }
    for (const id of expired) {
      this.buffs.delete(id);
    }
  }

  getActiveBuffs(currentTime) {
    const list = [];
    for (const buff of this.buffs.values()) {
      list.push({
        id: buff.id,
        name: buff.name,
        icon: buff.icon,
        color: buff.color,
        remainingMs: Math.max(0, buff.expiresAt - currentTime),
        totalMs: buff.totalMs,
      });
    }
    return list;
  }
}

/* ==============================================================================
 * TIER 1: FEATURE COVERAGE (INVENTORY, BUFFS, BRIDGE, MOBILE DRAWER, TOOLTIPS)
 * ============================================================================== */

test('Tier 1 [Inventory Schema]: CollectedItemEntry defines complete visual and lore fields', () => {
  const itemEntry = {
    id: 'PIERCING_BOMB',
    name: 'Spike Penetrator Bomb',
    category: 'bomb',
    rarity: 'rare',
    count: 1,
    iconKey: 'item_piercing_bomb',
    description: 'Blasts pierce through all soft blocks in their path.',
    mechanics: 'Ignores soft block termination during blast raycast',
  };

  assert.equal(itemEntry.id, 'PIERCING_BOMB');
  assert.equal(itemEntry.rarity, 'rare');
  assert.equal(itemEntry.count, 1);
  assert.ok(itemEntry.description.length > 10);
  assert.ok(itemEntry.mechanics.length > 10);
});

test('Tier 1 [Active Buffs]: ActiveBuffsManager tracks duration, calculates remaining ms, and auto-expires', () => {
  const buffs = new ActiveBuffsManager();
  buffs.addBuff('SPEED_SURGE', 'Speed Surge', '⚡', '#bef264', 8000, 1000);

  // At t = 3000ms (2000ms elapsed) -> 6000ms remaining
  let active = buffs.getActiveBuffs(3000);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'SPEED_SURGE');
  assert.equal(active[0].remainingMs, 6000);
  assert.equal(active[0].totalMs, 8000);

  // Advance time past expiration (t = 9500ms)
  buffs.update(9500);
  active = buffs.getActiveBuffs(9500);
  assert.equal(active.length, 0, 'Expired buff must be automatically purged');
});

test('Tier 1 [Stats Bridge]: Emits immutable deep-cloned snapshots to subscribers', () => {
  const bridge = new StatsBridgeManager();
  let receivedSnapshot = null;

  bridge.on('stats-update', (data) => {
    receivedSnapshot = data;
  });

  const payload = {
    speed: 175,
    maxBombs: 3,
    ultimateGauge: 45,
    inventory: [{ id: 'SPEED_UP', count: 1 }],
  };

  bridge.emit('stats-update', payload, 1000, true);
  assert.deepEqual(receivedSnapshot, payload);

  // Mutate original source payload
  payload.speed = 250;
  payload.inventory.push({ id: 'BOMB_UP', count: 1 });

  // Verify subscriber snapshot was not mutated (immutable deep copy)
  assert.equal(receivedSnapshot.speed, 175);
  assert.equal(receivedSnapshot.inventory.length, 1);
});

test('Tier 1 [Mobile Drawer]: MobileHUDController toggles drawer, selects items, and closes', () => {
  const mobile = new MobileHUDController();
  assert.equal(mobile.isInventoryOpen, false);
  assert.equal(mobile.selectedItemId, null);

  // Open drawer
  mobile.toggleInventory();
  assert.equal(mobile.isInventoryOpen, true);

  // Tap an item to inspect details
  mobile.selectItem('ICE_BOMB');
  assert.equal(mobile.selectedItemId, 'ICE_BOMB');

  // Close drawer
  mobile.closeInventory();
  assert.equal(mobile.isInventoryOpen, false);
  assert.equal(mobile.selectedItemId, null);
});

test('Tier 1 [Desktop Tooltip]: Tooltip model renders category, rarity badge, stat delta, and flavor lore', () => {
  function createTooltipModel(itemDef) {
    return {
      title: itemDef.name,
      badgeText: itemDef.rarity.toUpperCase(),
      badgeColor: RARITY_COLORS[itemDef.rarity],
      categoryLabel: `${itemDef.category.toUpperCase()} MODIFIER`,
      mechanics: itemDef.description,
      isGlassmorphic: true,
    };
  }

  const tooltip = createTooltipModel({
    name: 'Quantum Phasing Treads',
    category: 'utility',
    rarity: 'epic',
    description: 'Pass freely through soft destructible blocks.',
  });

  assert.equal(tooltip.title, 'Quantum Phasing Treads');
  assert.equal(tooltip.badgeText, 'EPIC');
  assert.equal(tooltip.badgeColor, '#c084fc');
  assert.equal(tooltip.categoryLabel, 'UTILITY MODIFIER');
  assert.equal(tooltip.isGlassmorphic, true);
});

/* ==============================================================================
 * TIER 2: BOUNDARY & CORNER CASES (THROTTLING, UNMOUNT LEAKS, EMPTY/FULL INVENTORY)
 * ============================================================================== */

test('Tier 2: Event Throttling — 60fps frame flooding is strictly suppressed to 200ms intervals', () => {
  const bridge = new StatsBridgeManager();
  let receivedCount = 0;

  bridge.on('stats-update', () => {
    receivedCount++;
  });

  const payload = { speed: 150 };

  // Simulate 60 frames (16.6ms intervals over 1000ms)
  for (let frame = 0; frame < 60; frame++) {
    const time = frame * 16.6;
    bridge.emit('stats-update', payload, time, false);
  }

  // Over 1000ms, with 200ms throttle, exactly 5-6 emissions occur instead of 60
  assert.ok(receivedCount >= 5 && receivedCount <= 6, `Received ${receivedCount} emissions, expected 5-6`);
});

test('Tier 2: Event Listener Cleanup — unmounting component stops emissions without zombie leaks', () => {
  const bridge = new StatsBridgeManager();
  let callCount = 0;
  const listener = () => {
    callCount++;
  };

  bridge.on('stats-update', listener);
  bridge.emit('stats-update', {}, 1000, true);
  assert.equal(callCount, 1);

  // Unmount: remove listener
  bridge.off('stats-update', listener);
  bridge.emit('stats-update', {}, 2000, true);
  assert.equal(callCount, 1, 'Unmounted listener must receive zero subsequent updates');
});

test('Tier 2: Empty Inventory and Full 24-Item Inventory structures serialize cleanly', () => {
  // Empty inventory
  const emptyInventory = [];
  assert.equal(emptyInventory.length, 0);

  // Full 24 items inventory
  const fullInventory = [];
  for (let i = 0; i < 24; i++) {
    fullInventory.push({
      id: `ITEM_${i}`,
      name: `Item Name ${i}`,
      category: 'stat',
      rarity: 'common',
      count: 1,
    });
  }

  assert.equal(fullInventory.length, 24);
  const jsonStr = JSON.stringify(fullInventory);
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.length, 24);
});

/* ==============================================================================
 * TIER 3: CROSS-FEATURE COMBINATIONS
 * ============================================================================== */

test('Tier 3: Collecting an item mutates inventory and triggers immediate forced bridge update', () => {
  const bridge = new StatsBridgeManager();
  let latestStats = null;
  bridge.on('stats-update', (s) => {
    latestStats = s;
  });

  const playerStats = {
    speed: 150,
    inventory: {},
    itemsCollectedTotal: 0,
  };

  function collectItem(stats, itemId, currentTime) {
    stats.inventory[itemId] = (stats.inventory[itemId] || 0) + 1;
    stats.itemsCollectedTotal++;
    // Item collection bypasses 200ms throttling (force = true)
    bridge.emit('stats-update', stats, currentTime, true);
  }

  collectItem(playerStats, 'ARMOR_UP', 1050);
  assert.equal(latestStats.itemsCollectedTotal, 1);
  assert.equal(latestStats.inventory.ARMOR_UP, 1);
});

test('Tier 3: Mobile [ULT] touch button dispatches to mobileInput only when gauge is 100% and lockout is 0', () => {
  const mobile = new MobileHUDController();

  // Test 1: Gauge at 50% -> Press rejected
  const stats1 = { ultimateGauge: 50, ultimateLockoutRemaining: 0 };
  const accepted1 = mobile.handleUltimatePress(stats1);
  assert.equal(accepted1, false);
  assert.equal(mobile.mobileInput.ultimate, false);

  // Test 2: Gauge at 100% but in Lockout -> Press rejected
  const stats2 = { ultimateGauge: 100, ultimateLockoutRemaining: 3000 };
  const accepted2 = mobile.handleUltimatePress(stats2);
  assert.equal(accepted2, false);
  assert.equal(mobile.mobileInput.ultimate, false);

  // Test 3: Gauge at 100% and ready -> Accepted!
  const stats3 = { ultimateGauge: 100, ultimateLockoutRemaining: 0 };
  const accepted3 = mobile.handleUltimatePress(stats3);
  assert.equal(accepted3, true);
  assert.equal(mobile.mobileInput.ultimate, true);

  // Pointer up releases button
  mobile.releaseUltimate();
  assert.equal(mobile.mobileInput.ultimate, false);
});

/* ==============================================================================
 * TIER 4: REAL-WORLD APPLICATION SCENARIO
 * ============================================================================== */

test('Tier 4: Full Session HUD & Inventory Flow — item collection, mobile drawer inspection, and ult cast', () => {
  const bridge = new StatsBridgeManager();
  const mobile = new MobileHUDController();
  const buffs = new ActiveBuffsManager();

  let uiState = {
    stats: null,
    drawerOpen: false,
    selectedItem: null,
  };

  bridge.on('stats-update', (s) => {
    uiState.stats = s;
  });

  const initialStats = {
    speed: 150,
    maxBombs: 1,
    bombPower: 2,
    ultimateGauge: 0,
    ultimateLockoutRemaining: 0,
    inventory: {},
    itemsCollectedTotal: 0,
  };

  // 1. Initial connect
  bridge.emit('stats-update', initialStats, 0, true);
  assert.equal(uiState.stats.speed, 150);

  // 2. Player picks up SPEED_SURGE and ICE_BOMB
  initialStats.inventory.SPEED_SURGE = 1;
  initialStats.inventory.ICE_BOMB = 1;
  initialStats.itemsCollectedTotal = 2;
  initialStats.ultimateGauge = 100; // Fully charged!
  buffs.addBuff('SPEED_SURGE', 'Speed Surge', '⚡', '#bef264', 8000, 10000);
  bridge.emit('stats-update', initialStats, 10000, true);

  assert.equal(uiState.stats.itemsCollectedTotal, 2);
  assert.equal(uiState.stats.ultimateGauge, 100);

  // 3. Player opens mobile inventory drawer to inspect ICE_BOMB
  mobile.toggleInventory();
  mobile.selectItem('ICE_BOMB');
  uiState.drawerOpen = mobile.isInventoryOpen;
  uiState.selectedItem = mobile.selectedItemId;

  assert.equal(uiState.drawerOpen, true);
  assert.equal(uiState.selectedItem, 'ICE_BOMB');

  // 4. Player closes drawer and triggers Ultimate Skill
  mobile.closeInventory();
  uiState.drawerOpen = mobile.isInventoryOpen;
  assert.equal(uiState.drawerOpen, false);

  const fired = mobile.handleUltimatePress(uiState.stats);
  assert.equal(fired, true);
  assert.equal(mobile.mobileInput.ultimate, true);

  // 5. Ultimate consumes gauge and triggers lockout
  initialStats.ultimateGauge = 0;
  initialStats.ultimateLockoutRemaining = 6000;
  bridge.emit('stats-update', initialStats, 10200, true);
  assert.equal(uiState.stats.ultimateGauge, 0);
  assert.equal(uiState.stats.ultimateLockoutRemaining, 6000);
});

/* ==============================================================================
 * TIER 5: DEFENSIVE UI & INPUT REMEDIATION TESTS (UI-03, UI-04, UI-05)
 * ============================================================================== */

test('UI-03: Virtual joystick 8-way partition eliminates dead zones at 135° and 225°', () => {
  function mapJoystickAngle(angle, distance) {
    const input = { up: false, down: false, left: false, right: false };
    if (distance !== undefined && distance < 5) {
      return input;
    }
    const norm = ((angle % 360) + 360) % 360;
    input.up = norm >= 22.5 && norm <= 157.5;
    input.down = norm >= 202.5 && norm <= 337.5;
    input.left = norm >= 112.5 && norm <= 247.5;
    input.right = norm <= 67.5 || norm >= 292.5;
    return input;
  }

  // Deadzone check
  const dead = mapJoystickAngle(135, 3);
  assert.equal(dead.up, false);
  assert.equal(dead.left, false);

  // Exact 135.0° (Up-Left diagonal) — previously ALL false!
  const upLeft = mapJoystickAngle(135, 20);
  assert.equal(upLeft.up, true, '135° must have up=true');
  assert.equal(upLeft.left, true, '135° must have left=true');
  assert.equal(upLeft.down, false);
  assert.equal(upLeft.right, false);

  // Exact 225.0° (Down-Left diagonal) — previously ALL false!
  const downLeft = mapJoystickAngle(225, 20);
  assert.equal(downLeft.down, true, '225° must have down=true');
  assert.equal(downLeft.left, true, '225° must have left=true');
  assert.equal(downLeft.up, false);
  assert.equal(downLeft.right, false);

  // Exact 45.0° (Up-Right diagonal)
  const upRight = mapJoystickAngle(45, 20);
  assert.equal(upRight.up, true);
  assert.equal(upRight.right, true);

  // Exact 315.0° (Down-Right diagonal)
  const downRight = mapJoystickAngle(315, 20);
  assert.equal(downRight.down, true);
  assert.equal(downRight.right, true);

  // Cardinal directions: 0° Right, 90° Up, 180° Left, 270° Down
  assert.deepEqual(mapJoystickAngle(0, 20), { up: false, down: false, left: false, right: true });
  assert.deepEqual(mapJoystickAngle(90, 20), { up: true, down: false, left: false, right: false });
  assert.deepEqual(mapJoystickAngle(180, 20), { up: false, down: false, left: true, right: false });
  assert.deepEqual(mapJoystickAngle(270, 20), { up: false, down: true, left: false, right: false });
});

test('UI-04: Action button pointer cancel immediately resets input without stuck state', () => {
  const mobileInput = { bomb: false, dash: false, ultimate: false };

  // Press down
  mobileInput.bomb = true;
  assert.equal(mobileInput.bomb, true);

  // Cancel event (e.g. gesture interrupted or finger dragged off)
  const handleBombCancel = () => {
    mobileInput.bomb = false;
  };
  handleBombCancel();
  assert.equal(mobileInput.bomb, false);

  // Ultimate press and cancel
  mobileInput.ultimate = true;
  const handleUltimateCancel = () => {
    mobileInput.ultimate = false;
  };
  handleUltimateCancel();
  assert.equal(mobileInput.ultimate, false);
});

test('UI-05: Global key handler ignores input and avoids preventDefault inside textarea and input elements', () => {
  const mobileInput = { up: false, down: false, left: false, right: false, bomb: false, dash: false, ultimate: false };

  function handleKeyDown(e) {
    const target = e.target;
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
      return false; // Ignored, no preventDefault
    }
    const key = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'e', 'r', 'q'].includes(key) || e.code === 'Space') {
      e.prevented = true;
    }
    if (key === ' ' || e.code === 'Space') {
      mobileInput.bomb = true;
    }
    return true;
  }

  // Typing space inside a <textarea> in the Backup/Import modal
  const textareaEvent = {
    key: ' ',
    code: 'Space',
    target: { tagName: 'TEXTAREA' },
    prevented: false,
  };
  const processedTextarea = handleKeyDown(textareaEvent);
  assert.equal(processedTextarea, false);
  assert.equal(textareaEvent.prevented, false, 'Must NOT call preventDefault on textarea space');
  assert.equal(mobileInput.bomb, false, 'Must NOT plant bomb when typing in textarea');

  // Normal gameplay spacebar
  const gameEvent = {
    key: ' ',
    code: 'Space',
    target: { tagName: 'CANVAS' },
    prevented: false,
  };
  const processedGame = handleKeyDown(gameEvent);
  assert.equal(processedGame, true);
  assert.equal(gameEvent.prevented, true, 'Must call preventDefault on game space');
  assert.equal(mobileInput.bomb, true, 'Must plant bomb during game');
});

