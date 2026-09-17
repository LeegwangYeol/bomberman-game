import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectPool, POOL_PRESETS } from '../../src/game/pooling/ObjectPool.ts';

test('ObjectPool: verifies POOL_PRESETS match PROJECT.md mandates', () => {
  assert.strictEqual(POOL_PRESETS.BOMBS, 32);
  assert.strictEqual(POOL_PRESETS.EXPLOSIONS, 128);
  assert.strictEqual(POOL_PRESETS.PARTICLES, 256);
  assert.strictEqual(POOL_PRESETS.ITEM_DROPS, 48);
  assert.strictEqual(POOL_PRESETS.FLOATING_TEXT, 32);
});

test('ObjectPool: pre-allocates contiguous storage and initializes counts', () => {
  let createdCount = 0;
  const pool = new ObjectPool({
    capacity: 10,
    factory: (i) => {
      createdCount++;
      return { id: i, active: false };
    },
    reset: (item) => {
      item.active = false;
    },
    onAcquire: (item) => {
      item.active = true;
    },
  });

  assert.strictEqual(createdCount, 10);
  assert.strictEqual(pool.capacity, 10);
  assert.strictEqual(pool.activeCount, 0);
  assert.strictEqual(pool.freeCount, 10);
  assert.strictEqual(pool.isExhausted, false);
});

test('ObjectPool: acquires items up to capacity and tracks activeCount and freeCount', () => {
  const pool = new ObjectPool({
    capacity: 5,
    factory: (i) => ({ index: i, val: 0 }),
  });

  const acquired = [];
  for (let i = 0; i < 5; i++) {
    const item = pool.acquire();
    assert.ok(item !== null);
    assert.strictEqual(pool.isActive(item), true);
    acquired.push(item);
  }

  assert.strictEqual(pool.activeCount, 5);
  assert.strictEqual(pool.freeCount, 0);
  assert.strictEqual(pool.isExhausted, true);

  // Subsequent acquire returns null
  const overflow = pool.acquire();
  assert.strictEqual(overflow, null);
});

test('ObjectPool: releases items with swap-and-pop O(1) mechanics and invokes reset callback', () => {
  let resetInvocations = 0;
  const pool = new ObjectPool({
    capacity: 4,
    factory: (i) => ({ id: i, value: i * 10 }),
    reset: (item) => {
      resetInvocations++;
      item.value = -1;
    },
  });

  const a = pool.acquire();
  const b = pool.acquire();
  const c = pool.acquire();

  assert.strictEqual(pool.activeCount, 3);
  assert.strictEqual(pool.freeCount, 1);

  // Release middle item b
  const released = pool.release(b);
  assert.strictEqual(released, true);
  assert.strictEqual(pool.isActive(b), false);
  assert.strictEqual(b.value, -1);
  assert.strictEqual(resetInvocations, 1);
  assert.strictEqual(pool.activeCount, 2);
  assert.strictEqual(pool.freeCount, 2);

  // Remaining active should be a and c
  const activeItems = [];
  pool.forEachActive((item) => {
    activeItems.push(item);
  });
  assert.strictEqual(activeItems.length, 2);
  assert.ok(activeItems.includes(a));
  assert.ok(activeItems.includes(c));
  assert.ok(!activeItems.includes(b));
});

test('ObjectPool: double-release protection prevents corrupting free list', () => {
  const pool = new ObjectPool({
    capacity: 4,
    factory: (i) => ({ id: i }),
  });

  const item = pool.acquire();
  assert.strictEqual(pool.activeCount, 1);
  assert.strictEqual(pool.freeCount, 3);

  const firstRelease = pool.release(item);
  assert.strictEqual(firstRelease, true);
  assert.strictEqual(pool.activeCount, 0);
  assert.strictEqual(pool.freeCount, 4);

  // Second release of same item must fail safely
  const secondRelease = pool.release(item);
  assert.strictEqual(secondRelease, false);
  assert.strictEqual(pool.activeCount, 0);
  assert.strictEqual(pool.freeCount, 4);
});

test('ObjectPool: foreign object release is safely rejected', () => {
  const pool = new ObjectPool({
    capacity: 4,
    factory: (i) => ({ id: i }),
  });

  const foreign = { id: 999 };
  const result = pool.release(foreign);
  assert.strictEqual(result, false);
});

test('ObjectPool: reset() clears all active items and invokes reset callbacks', () => {
  let resetCount = 0;
  const pool = new ObjectPool({
    capacity: 6,
    factory: (i) => ({ id: i }),
    reset: () => {
      resetCount++;
    },
  });

  for (let i = 0; i < 4; i++) {
    pool.acquire();
  }
  assert.strictEqual(pool.activeCount, 4);

  pool.reset();
  assert.strictEqual(pool.activeCount, 0);
  assert.strictEqual(pool.freeCount, 6);
  assert.strictEqual(resetCount, 4);
});

test('ObjectPool: 10,000 continuous acquire/release stress cycles maintain strict invariants', () => {
  const pool = new ObjectPool({
    capacity: 64,
    factory: (i) => ({ id: i, count: 0 }),
    reset: (item) => {
      item.count = 0;
    },
  });

  for (let cycle = 0; cycle < 10000; cycle++) {
    const batch = [];
    const batchSize = 1 + (cycle % 32);

    for (let i = 0; i < batchSize; i++) {
      const item = pool.acquire();
      assert.ok(item !== null);
      batch.push(item);
    }
    assert.strictEqual(pool.activeCount, batchSize);

    // Release in reverse or arbitrary order
    if (cycle % 2 === 0) {
      for (let i = batch.length - 1; i >= 0; i--) {
        assert.strictEqual(pool.release(batch[i]), true);
      }
    } else {
      for (let i = 0; i < batch.length; i++) {
        assert.strictEqual(pool.release(batch[i]), true);
      }
    }

    assert.strictEqual(pool.activeCount, 0);
    assert.strictEqual(pool.freeCount, 64);
  }
});
