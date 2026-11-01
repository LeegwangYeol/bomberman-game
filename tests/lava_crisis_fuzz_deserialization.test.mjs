import test from 'node:test';
import assert from 'node:assert/strict';
import { LavaCrisis } from '../src/game/crises/LavaCrisis.ts';
import { CrisisStage, HazardType } from '../src/game/crises/CrisisTypes.ts';

test('LavaCrisis Fuzzing: Partial<SerializedCrisisState> with corrupt inputs, nulls, NaNs, missing extraState, and partial objects', () => {
  const crisis = new LavaCrisis();
  crisis.init();

  // Test cases for fuzzing deserialize
  const corruptInputs = [
    null,
    undefined,
    {},
    { stage: null },
    { stage: 'INVALID_STAGE' },
    { threatMeter: NaN },
    { threatMeter: Infinity },
    { threatMeter: -Infinity },
    { threatMeter: '999' },
    { stageElapsedMs: NaN },
    { stageDurationMs: -1000 },
    { objectives: null },
    { objectives: [{ id: 'solidify_lava', currentCount: NaN, targetCount: -5 }] },
    { objectives: [null, undefined, { id: null }] },
    { activeAlert: null },
    { activeAlert: { id: NaN, durationMs: -500, level: 'INVALID_LEVEL' } },
    { hazardTiles: null },
    { hazardTiles: [null, undefined, { r: -1, c: 999, type: 'INVALID', intensity: NaN, remainingMs: Infinity, data: NaN }] },
    { hazardTiles: [{ r: 3, c: 4, type: HazardType.LAVA_SURFACE, intensity: 1.5, remainingMs: -100, data: NaN }] },
    { isVictorious: 'yes' },
    { isDefeated: 1 },
    { extraState: null },
    { extraState: { someRandomProp: NaN } },
  ];

  for (const input of corruptInputs) {
    assert.doesNotThrow(() => {
      crisis.deserialize(input);
      crisis.update(16);
      crisis.getStatus();
      crisis.serialize();
    }, `Failed when deserializing corrupt input: ${JSON.stringify(input)}`);
  }
});
