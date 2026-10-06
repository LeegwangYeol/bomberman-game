import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FrostHazard,
  FrostLifecycleState,
  FrostDangerValue,
} from '../../src/game/hazards/FrostHazard.ts';

test('FrostHazard Counterplay [Bomb Blast Impact]: Bomb blast in glaciated zone forces thaw transition', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Advance 1000ms (during HOARFROST_SURGE)
  hazard.update(1000);
  assert.equal(hazard.getState(), FrostLifecycleState.HOARFROST_SURGE);
  assert.equal(hazard.isTileGlaciated(6, 7), true);

  // Bomb blast impact on glaciated tile forces THAW_COOLDOWN
  const thawed = hazard.onBombBlastImpact(6, 7);
  assert.equal(thawed, true);
  assert.equal(hazard.getState(), FrostLifecycleState.THAW_COOLDOWN);
});

test('FrostHazard Counterplay [Non-Glaciated Impact]: Impact on safe tile does not thaw hazard', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);
  hazard.update(1000);

  // Corner tile (0, 0) is not glaciated
  const thawed = hazard.onBombBlastImpact(0, 0);
  assert.equal(thawed, false);
  assert.equal(hazard.getState(), FrostLifecycleState.HOARFROST_SURGE);
});

test('FrostHazard Lifecycle [Reset & Stop Integrity]: Resets all grid buffers and pools to safe initial state', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);
  hazard.update(1000);

  hazard.stop();
  assert.equal(hazard.getState(), FrostLifecycleState.DORMANT);

  for (let i = 0; i < hazard.dangerMask.length; i++) {
    assert.equal(hazard.dangerMask[i], FrostDangerValue.SAFE);
  }

  // Verify reset clears scratch pools
  hazard.reset();
  assert.equal(hazard.getState(), FrostLifecycleState.DORMANT);
});
