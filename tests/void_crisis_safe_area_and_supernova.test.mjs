/**
 * tests/void_crisis_safe_area_and_supernova.test.mjs
 *
 * Dedicated audit and verification test suite for VoidCrisis:
 * 1. 3x3 Safe Auras around charged Purification Prisms guarantee >= 40% safe arena area.
 * 2. Supernova Cleanse accurately clears all void creep tiles across the grid.
 * 3. Supernova Cleanse shatters the Void Avatar's Iridescent Shield.
 * 4. Avatar damage mechanics: Impervious deflection while shielded, vulnerable once cleansed.
 * 5. Dynamic Safe Area calculations: getSafeAreaRatio() and getWalkableSafeAreaRatio().
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { VoidCrisis } from '../src/game/crises/VoidCrisis.ts';
import { CrisisStage, HazardType } from '../src/game/crises/CrisisTypes.ts';
import { ROWS, COLS } from '../src/game/pathfinding.ts';

test('VoidCrisis Safe Area: 1. Initial state has 100% safe area and uncharged prisms', () => {
  const crisis = new VoidCrisis();
  crisis.init();

  assert.equal(crisis.prisms.length, 2);
  assert.equal(crisis.prisms[0].isCharged, false);
  assert.equal(crisis.prisms[1].isCharged, false);
  assert.equal(crisis.voidCreepCount, 0);
  assert.equal(crisis.avatarSpawned, false);
  assert.equal(crisis.avatarShieldActive, true);
  assert.equal(crisis.supernovaCleansed, false);

  assert.ok(crisis.getWalkableSafeAreaRatio() >= VoidCrisis.MIN_SAFE_AREA_RATIO);
  assert.ok(crisis.getWalkableSafeAreaRatio() >= 0.96); // 107/111 = 96.4% due to 4 initial rifts
  assert.ok(crisis.getSafeAreaRatio() >= VoidCrisis.MIN_SAFE_AREA_RATIO);
});

test('VoidCrisis Safe Area: 2. isTileInSafeAura accurately bounds 3x3 aura around charged prisms', () => {
  const crisis = new VoidCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  const prism0 = crisis.prisms[0]; // (1, 13)
  const prism1 = crisis.prisms[1]; // (11, 1)

  // Uncharged: safe aura is inactive
  assert.equal(crisis.isTileInSafeAura(prism0.r, prism0.c), false);
  assert.equal(crisis.isTileInSafeAura(prism0.r, prism0.c - 1), false);
  assert.equal(crisis.isTileInSafeAura(prism1.r, prism1.c), false);

  // Charge prism 0 (3 hits)
  for (let i = 0; i < 3; i++) {
    crisis.handleBombBlast(prism0.r, prism0.c, 1);
  }
  assert.equal(prism0.isCharged, true);

  // Prism 0 neighborhood is now in safe aura
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const tr = prism0.r + dr;
      const tc = prism0.c + dc;
      if (tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS) {
        assert.equal(crisis.isTileInSafeAura(tr, tc), true, `Tile (${tr}, ${tc}) must be in safe aura`);
      }
    }
  }

  // Outside 3x3 is NOT in safe aura
  assert.equal(crisis.isTileInSafeAura(prism0.r + 2, prism0.c), false);
  assert.equal(crisis.isTileInSafeAura(prism0.r, prism0.c - 2), false);

  // Prism 1 is still uncharged
  assert.equal(crisis.isTileInSafeAura(prism1.r, prism1.c), false);
});

test('VoidCrisis Safe Area: 3. Creep cannot spread into 3x3 safe aura of charged prism', () => {
  const crisis = new VoidCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  const prism1 = crisis.prisms[1]; // (11, 1)

  // Prior to charge, walkable tiles in neighborhood can accept creep
  assert.equal(crisis.canCreepSpreadTo(prism1.r - 1, prism1.c), true); // (10, 1) is walkable
  assert.equal(crisis.canCreepSpreadTo(prism1.r, prism1.c + 1), true); // (11, 2) is walkable

  // Fully charge prism 1
  for (let i = 0; i < 3; i++) {
    crisis.handleBombBlast(prism1.r, prism1.c, 1);
  }
  assert.equal(prism1.isCharged, true);

  // Now creep is strictly blocked from the entire 3x3 neighborhood
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      assert.equal(crisis.canCreepSpreadTo(prism1.r + dr, prism1.c + dc), false);
    }
  }
});

test('VoidCrisis Safe Area: 4. cleanseAura purges preexisting void creep inside 3x3 safe zone', () => {
  const crisis = new VoidCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  const prism0 = crisis.prisms[0]; // (1, 13)
  // Manually place void creep adjacent to prism0
  crisis.setHazardTile(prism0.r, prism0.c - 1, HazardType.VOID_CREEP, 0.8, 0, 0); // (1, 12)
  crisis.setHazardTile(prism0.r + 1, prism0.c, HazardType.VOID_CREEP, 0.8, 0, 0); // (2, 13)
  crisis.voidCreepCount = 2;

  assert.ok(crisis.getHazardAt(1, 12) !== null);
  assert.ok(crisis.getHazardAt(2, 13) !== null);

  // Fully charge prism0, which triggers cleanseAura(prism0.r, prism0.c, 1)
  for (let i = 0; i < 3; i++) {
    crisis.handleBombBlast(prism0.r, prism0.c, 1);
  }

  // Preexisting creep in 3x3 aura must be purged
  assert.equal(crisis.getHazardAt(1, 12), null);
  assert.equal(crisis.getHazardAt(2, 13), null);
  assert.equal(crisis.voidCreepCount, 0);
});

test('VoidCrisis Safe Area: 5. Supernova Cleanse clears all void creep across entire arena', () => {
  const crisis = new VoidCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Populate multiple creep tiles across distant areas of the arena
  const testTiles = [
    { r: 1, c: 5 },
    { r: 2, c: 7 },
    { r: 5, c: 3 },
    { r: 7, c: 9 },
    { r: 10, c: 5 },
    { r: 11, c: 8 },
  ];
  const initialCreep = crisis.voidCreepCount;
  for (const t of testTiles) {
    crisis.setHazardTile(t.r, t.c, HazardType.VOID_CREEP, 0.8, 0, 0);
    crisis.voidCreepCount++;
  }
  assert.equal(crisis.voidCreepCount, initialCreep + 6);

  // Trigger Supernova Cleanse
  crisis.triggerSupernovaCleanse();

  assert.equal(crisis.supernovaCleansed, true);
  assert.equal(crisis.voidCreepCount, 0);

  // Verify all tiles are cleared of VOID_CREEP
  for (const t of testTiles) {
    assert.equal(crisis.getHazardAt(t.r, t.c), null, `Creep at (${t.r}, ${t.c}) must be purged`);
  }

  // Active hazards list should have ZERO VOID_CREEP entries
  const activeHazards = crisis.getActiveHazardTiles();
  const remainingCreep = activeHazards.filter((h) => h.type === HazardType.VOID_CREEP);
  assert.equal(remainingCreep.length, 0);
});

test('VoidCrisis Safe Area: 6. Supernova Cleanse shatters Avatar shield and enables damage', () => {
  const crisis = new VoidCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.CLIMAX);

  assert.equal(crisis.avatarSpawned, true);
  assert.equal(crisis.avatarShieldActive, true);
  assert.equal(crisis.avatarHp, 3);

  // Bomb blast at center (6, 7) while shield is active
  crisis.handleBombBlast(6, 7, 2);
  // Shield absorbs blast, Avatar HP remains 3
  assert.equal(crisis.avatarHp, 3);
  assert.equal(crisis.avatarShieldActive, true);

  // Charge both prisms to trigger Supernova Cleanse
  for (let i = 0; i < 3; i++) {
    crisis.handleBombBlast(VoidCrisis.PRISM_POSITIONS[0].r, VoidCrisis.PRISM_POSITIONS[0].c, 1);
    crisis.handleBombBlast(VoidCrisis.PRISM_POSITIONS[1].r, VoidCrisis.PRISM_POSITIONS[1].c, 1);
  }

  // Supernova Cleanse must have shattered the shield
  assert.equal(crisis.supernovaCleansed, true);
  assert.equal(crisis.avatarShieldActive, false);

  // Now bomb blast damages Avatar
  crisis.handleBombBlast(6, 7, 1);
  assert.equal(crisis.avatarHp, 2);

  crisis.handleBombBlast(6, 7, 1);
  assert.equal(crisis.avatarHp, 1);

  crisis.handleBombBlast(6, 7, 1);
  assert.equal(crisis.avatarHp, 0);
  assert.equal(crisis.getStage(), CrisisStage.RESOLVED);
});

test('VoidCrisis Safe Area: 7. Safe area ratios strictly guarantee >= 40% across all states', () => {
  const crisis = new VoidCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Add 40 creep tiles
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (crisis.canCreepSpreadTo(r, c) && crisis.voidCreepCount < 40) {
        crisis.setHazardTile(r, c, HazardType.VOID_CREEP, 0.8, 0, 0);
        crisis.voidCreepCount++;
      }
    }
  }

  // Ratio must guarantee >= MIN_SAFE_AREA_RATIO (0.40)
  assert.ok(crisis.getWalkableSafeAreaRatio() >= VoidCrisis.MIN_SAFE_AREA_RATIO);
  assert.ok(crisis.getSafeAreaRatio() >= VoidCrisis.MIN_SAFE_AREA_RATIO);

  // When both prisms charge and Supernova Cleanse runs:
  crisis.triggerSupernovaCleanse();
  const postCleanseRatio = crisis.getRawWalkableSafeAreaRatio();
  // With all creep vaporized, only 4 rift tiles remain, yielding > 96% safe area
  assert.ok(postCleanseRatio >= 0.90, `Post-cleanse raw ratio ${postCleanseRatio} must exceed 90%`);
  assert.ok(postCleanseRatio >= VoidCrisis.MIN_SAFE_AREA_RATIO);
});

test('VoidCrisis Safe Area: 8. Creep expansion permanently halted after Supernova Cleanse', () => {
  const crisis = new VoidCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Charge both prisms
  for (let i = 0; i < 3; i++) {
    crisis.handleBombBlast(VoidCrisis.PRISM_POSITIONS[0].r, VoidCrisis.PRISM_POSITIONS[0].c, 1);
    crisis.handleBombBlast(VoidCrisis.PRISM_POSITIONS[1].r, VoidCrisis.PRISM_POSITIONS[1].c, 1);
  }
  assert.equal(crisis.supernovaCleansed, true);

  // canCreepSpreadTo must strictly return false for any coordinate
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      assert.equal(crisis.canCreepSpreadTo(r, c), false);
    }
  }

  // Updating the crisis does not spawn any new creep
  for (let tick = 0; tick < 100; tick++) {
    crisis.update(100);
  }
  assert.equal(crisis.voidCreepCount, 0);
});

test('VoidCrisis Safe Area: 9. Pre-collapse warning alert triggers at 60 tiles', () => {
  const crisis = new VoidCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  crisis.voidCreepCount = 59;
  crisis.update(16);
  assert.notEqual(crisis.getActiveAlert()?.id, 'void_critical_warning');

  // Cross 60 tiles threshold
  crisis.voidCreepCount = 60;
  crisis.update(16);
  assert.equal(crisis.getActiveAlert()?.id, 'void_critical_warning');
  assert.equal(crisis.getActiveAlert()?.title, 'SINGULARITY IMMINENT!');
  assert.ok(crisis.getActiveAlert()?.message.includes('Void creep consuming reality'));
});
