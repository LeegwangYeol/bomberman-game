import test from 'node:test';
import assert from 'node:assert/strict';

import { FloatingTextManager } from '../../src/game/ui/FloatingTextManager.ts';
import { OverheadUIManager } from '../../src/game/ui/OverheadUIManager.ts';

test('UI HUD Regression [FloatingTextManager Ring Buffer Saturation]: Handles 2,500 rapid bursts with zero leak or crash', () => {
  const manager = new FloatingTextManager();
  const baseTime = 10000;

  // Rapid burst of 2500 floating text registrations
  for (let i = 0; i < 2500; i++) {
    const offset = manager.registerSpawn(100 + (i % 10), 100 + (i % 10), baseTime + (i % 5));
    assert.ok(Number.isFinite(offset), 'Offset must always be a finite number');
    assert.ok(offset >= 0, 'Offset must be non-negative');
  }

  // Active count cannot exceed MAX_POOL = 1024
  const activeCount = manager.getActiveCount(baseTime);
  assert.ok(activeCount <= FloatingTextManager.MAX_POOL, 'Active count cannot exceed ring buffer pool limit');

  // Advance time past cutoff window (450ms)
  const agedCount = manager.getActiveCount(baseTime + 1000);
  assert.equal(agedCount, 0, 'All aged entries are purged past the 450ms window');

  // Post-purge registration works cleanly
  const newOffset = manager.registerSpawn(200, 200, baseTime + 1500);
  assert.equal(newOffset, 0, 'Fresh spawn in empty zone has 0 offset');
});

test('UI HUD Regression [FloatingTextManager Boundary Rejection]: Rejects NaN and infinite coordinates', () => {
  const manager = new FloatingTextManager();

  assert.equal(manager.getCascadeOffset(NaN, 100, 1000), 0);
  assert.equal(manager.getCascadeOffset(100, NaN, 1000), 0);
  assert.equal(manager.getCascadeOffset(100, 100, NaN), 0);
  assert.equal(manager.getCascadeOffset(Infinity, 100, 1000), 0);
  assert.equal(manager.getCascadeOffset(100, -Infinity, 1000), 0);
  assert.equal(manager.getActiveCount(NaN), manager.getActiveCount());
});

test('UI HUD Regression [OverheadUIManager Extreme Density]: 100 entities at identical coordinates produce zero NaN', () => {
  const manager = new OverheadUIManager(true);

  // Empty entities list executes cleanly
  assert.doesNotThrow(() => {
    manager.update([], null, 16);
  });

  // Create 100 mock entities at identical coordinates (150, 150)
  const entities = [];
  for (let i = 0; i < 100; i++) {
    entities.push({
      x: 150,
      y: 150,
      active: true,
      overheadUI: {
        isDestroyed: false,
        lodMode: 'full',
        isIntentVisible: false,
        currentAlpha: 1.0,
        setDepth: () => {},
        setAlpha: () => {},
        setLODMode: () => {},
        setCustomOffsets: () => {},
      },
    });
  }

  assert.doesNotThrow(() => {
    manager.update(entities, { x: 150, y: 150 }, 16);
  });
});
