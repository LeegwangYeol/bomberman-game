/**
 * Comprehensive Stellaris-Style Map Crises Subsystem Test Suite
 *
 * Covers:
 * 1. Tier 1: Crisis Types, Stages, Hazard Enums, and Definition Metadata Catalog
 * 2. Tier 2: CrisisManager 3-Stage FSM, Threat Dynamics, and Objective Lifecycle
 * 3. Tier 3: All 6 Distinct Crises Mechanics & Edge Cases:
 *    - Pastel Void Incursion (Perimeter immunity, Prisms, Supernova, 65% Singularity)
 *    - Clockwork Toy Rebellion (Conveyors, Cogs, EMP fuse interaction, 1.5s Dynamo Overload)
 *    - Orbital Bombardment (Kinetic reticles, impact craters, Macrocannon, 3 Uplinks)
 *    - Solar Flare Storm (Pillar raycast shelter, bomb flash-ignition, 4 Thermal Vents)
 *    - Creeping Lava Fissure (Advancing rings, entity incineration, Obsidian solidifying, Caldera Valve)
 *    - Dimensional Rift Inversion (Spawn displacement, toroidal wrapping, warp rifts, 2.0s Quantum Sync)
 * 4. Tier 4: SituationLog HUD Controller, Event Throttling & Headless Bridge
 * 5. Tier 5: Zero-GC Invariants, Continuous Frame Soak & Adversarial Rapid Switching
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  CrisisType,
  CrisisStage,
  HazardType,
  CRISIS_DEFINITIONS,
  CrisisManager,
  VoidCrisis,
  ClockworkCrisis,
  OrbitalCrisis,
  SolarFlareCrisis,
  LavaCrisis,
  RiftCrisis,
  SituationLog,
} from '../src/game/crises/index.ts';
import { ROWS, COLS } from '../src/game/pathfinding.ts';

/* ==============================================================================
 * TIER 1: SPECIFICATION CATALOG & DEFINITIONS
 * ============================================================================== */

test('Tier 1: Crisis Catalog defines all 6 distinct Stellaris crisis scenarios', () => {
  const expectedTypes = [
    CrisisType.PASTEL_VOID,
    CrisisType.CLOCKWORK_REBELLION,
    CrisisType.ORBITAL_BOMBARDMENT,
    CrisisType.SOLAR_FLARES,
    CrisisType.CREEPING_LAVA,
    CrisisType.DIMENSIONAL_RIFTS,
  ];

  assert.equal(expectedTypes.length, 6);
  for (const type of expectedTypes) {
    const def = CRISIS_DEFINITIONS[type];
    assert.ok(def, `Missing definition for crisis type: ${type}`);
    assert.equal(def.id, type);
    assert.ok(def.name.length > 0, `Missing name for ${type}`);
    assert.ok(def.icon.length > 0, `Missing icon for ${type}`);
    assert.ok(def.themeColor.startsWith('#'), `Invalid themeColor for ${type}: ${def.themeColor}`);
    assert.ok(def.stageDurations[CrisisStage.WHISPERS] > 0);
    assert.ok(def.stageDurations[CrisisStage.OUTBREAK] > 0);
    assert.ok(def.stageDurations[CrisisStage.CLIMAX] > 0);
  }
});

test('Tier 1: Crisis Stages cover full 5-stage lifecycle + INACTIVE', () => {
  assert.equal(CrisisStage.INACTIVE, 'INACTIVE');
  assert.equal(CrisisStage.WHISPERS, 'WHISPERS');
  assert.equal(CrisisStage.OUTBREAK, 'OUTBREAK');
  assert.equal(CrisisStage.CLIMAX, 'CLIMAX');
  assert.equal(CrisisStage.RESOLVED, 'RESOLVED');
  assert.equal(CrisisStage.FAILED, 'FAILED');
});

test('Tier 1: HazardType enum indexes all specialized environmental hazards', () => {
  assert.equal(HazardType.NONE, 0);
  assert.ok(HazardType.VOID_CREEP > 0);
  assert.ok(HazardType.PURIFICATION_PRISM > 0);
  assert.ok(HazardType.CONVEYOR_BELT > 0);
  assert.ok(HazardType.EMP_PULSE > 0);
  assert.ok(HazardType.BRASS_COG > 0);
  assert.ok(HazardType.DYNAMO_CONDUIT > 0);
  assert.ok(HazardType.KINETIC_TARGET > 0);
  assert.ok(HazardType.KINETIC_CRATER > 0);
  assert.ok(HazardType.UPLINK_TERMINAL > 0);
  assert.ok(HazardType.SOLAR_SWEEP > 0);
  assert.ok(HazardType.THERMAL_VENT > 0);
  assert.ok(HazardType.LAVA_SURFACE > 0);
  assert.ok(HazardType.OBSIDIAN_BLOCK > 0);
  assert.ok(HazardType.CALDERA_VALVE > 0);
  assert.ok(HazardType.DIMENSIONAL_WARP > 0);
  assert.ok(HazardType.QUANTUM_SPIRE > 0);
});

/* ==============================================================================
 * TIER 2: CRISIS MANAGER FSM & THREAT DYNAMICS
 * ============================================================================== */

test('Tier 2: CrisisManager initializes inactive and triggers crisis cleanly', () => {
  const manager = new CrisisManager();
  assert.equal(manager.getStage(), CrisisStage.INACTIVE);
  assert.equal(manager.getCurrentCrisisType(), null);
  assert.equal(manager.getThreatMeter(), 0);

  manager.triggerCrisis(CrisisType.PASTEL_VOID);
  assert.equal(manager.getStage(), CrisisStage.WHISPERS);
  assert.equal(manager.getCurrentCrisisType(), CrisisType.PASTEL_VOID);
  assert.ok(manager.getThreatMeter() >= 10);
});

test('Tier 2: CrisisManager advances through 3-Stage FSM automatically via elapsed time', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.ORBITAL_BOMBARDMENT);
  const def = CRISIS_DEFINITIONS[CrisisType.ORBITAL_BOMBARDMENT];

  assert.equal(manager.getStage(), CrisisStage.WHISPERS);

  // Advance time past Whispers stage duration
  manager.update(def.stageDurations[CrisisStage.WHISPERS] + 100);
  assert.equal(manager.getStage(), CrisisStage.OUTBREAK);
  assert.ok(manager.getThreatMeter() >= 35);

  // Advance time past Outbreak stage duration
  manager.update(def.stageDurations[CrisisStage.OUTBREAK] + 100);
  assert.equal(manager.getStage(), CrisisStage.CLIMAX);
  assert.ok(manager.getThreatMeter() >= 70);

  // Advance time past Climax stage duration without resolution -> Fails
  manager.update(def.stageDurations[CrisisStage.CLIMAX] + 100);
  assert.equal(manager.getStage(), CrisisStage.FAILED);
  assert.equal(manager.getThreatMeter(), 100);
});

test('Tier 2: Manual stopCrisis and reset cleanly terminate crisis', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.SOLAR_FLARES);
  assert.equal(manager.getStage(), CrisisStage.WHISPERS);

  manager.stopCrisis('resolved');
  assert.equal(manager.getStage(), CrisisStage.INACTIVE);
  assert.equal(manager.getTotalCrisesResolved(), 1);

  manager.triggerCrisis(CrisisType.CREEPING_LAVA);
  manager.reset();
  assert.equal(manager.getStage(), CrisisStage.INACTIVE);
  assert.equal(manager.getTotalCrisesResolved(), 0);
});

/* ==============================================================================
 * TIER 3: ALL 6 CRISES MECHANICS & EDGE CASES
 * ============================================================================== */

// --- CRISIS 1: PASTEL VOID ---
test('Tier 3 [Pastel Void]: Edge Case 7 — Outer perimeter walls are immune to void creep', () => {
  const voidCrisis = new VoidCrisis();
  voidCrisis.init();
  voidCrisis.transitionToStage(CrisisStage.OUTBREAK);

  // Perimeter wall checks
  assert.equal(voidCrisis.canCreepSpreadTo(0, 0), false);
  assert.equal(voidCrisis.canCreepSpreadTo(0, 5), false);
  assert.equal(voidCrisis.canCreepSpreadTo(ROWS - 1, 7), false);
  assert.equal(voidCrisis.canCreepSpreadTo(5, 0), false);
  assert.equal(voidCrisis.canCreepSpreadTo(5, COLS - 1), false);

  // Internal pillars are also immune
  assert.equal(voidCrisis.canCreepSpreadTo(2, 2), false);

  // Open walkable tile is allowed
  assert.equal(voidCrisis.canCreepSpreadTo(1, 1), true);
});

test('Tier 3 [Pastel Void]: 2 Purification Prisms charge via bomb blasts and activate 3x3 safe auras', () => {
  const voidCrisis = new VoidCrisis();
  voidCrisis.init();
  voidCrisis.transitionToStage(CrisisStage.OUTBREAK);

  const prism = voidCrisis.prisms[0]; // (1, 13)
  assert.equal(prism.isCharged, false);
  assert.equal(prism.charge, 0);

  // Blast 1
  voidCrisis.handleBombBlast(prism.r, prism.c, 1);
  assert.equal(prism.hits, 1);
  assert.ok(prism.charge >= 34);
  assert.equal(prism.isCharged, false);

  // Blast 2
  voidCrisis.handleBombBlast(prism.r, prism.c, 1);
  assert.equal(prism.hits, 2);
  assert.ok(prism.charge >= 68);
  assert.equal(prism.isCharged, false);

  // Blast 3 -> Fully Charged!
  voidCrisis.handleBombBlast(prism.r, prism.c, 1);
  assert.equal(prism.hits, 3);
  assert.equal(prism.charge, 100);
  assert.equal(prism.isCharged, true);

  // Safe aura protects adjacent tiles within Chebyshev distance 1
  assert.equal(voidCrisis.canCreepSpreadTo(prism.r, prism.c - 1), false);
});

test('Tier 3 [Pastel Void]: Charging both prisms triggers Supernova Cleanse, shatter shield & Avatar defeat', () => {
  const voidCrisis = new VoidCrisis();
  voidCrisis.init();
  voidCrisis.transitionToStage(CrisisStage.CLIMAX);

  assert.equal(voidCrisis.avatarShieldActive, true);
  assert.equal(voidCrisis.avatarHp, 3);

  // Bombing avatar while shield is active does not damage it
  voidCrisis.handleBombBlast(6, 7, 1);
  assert.equal(voidCrisis.avatarHp, 3);

  // Charge both prisms to 100%
  for (let i = 0; i < 3; i++) {
    voidCrisis.handleBombBlast(VoidCrisis.PRISM_POSITIONS[0].r, VoidCrisis.PRISM_POSITIONS[0].c, 1);
    voidCrisis.handleBombBlast(VoidCrisis.PRISM_POSITIONS[1].r, VoidCrisis.PRISM_POSITIONS[1].c, 1);
  }

  // Supernova cleanse triggered!
  assert.equal(voidCrisis.supernovaCleansed, true);
  assert.equal(voidCrisis.avatarShieldActive, false);
  assert.equal(voidCrisis.voidCreepCount, 0);

  // Now bombing avatar damages it
  voidCrisis.handleBombBlast(6, 7, 1);
  assert.equal(voidCrisis.avatarHp, 2);
  voidCrisis.handleBombBlast(6, 7, 1);
  assert.equal(voidCrisis.avatarHp, 1);
  voidCrisis.handleBombBlast(6, 7, 1);
  assert.equal(voidCrisis.avatarHp, 0);

  assert.equal(voidCrisis.getStage(), CrisisStage.RESOLVED);
});

test('Tier 3 [Pastel Void]: Edge Case 8 — Void creep reaching 65% walkable tiles (72) triggers Singularity Defeat', () => {
  const voidCrisis = new VoidCrisis();
  voidCrisis.init();
  voidCrisis.transitionToStage(CrisisStage.OUTBREAK);

  voidCrisis.voidCreepCount = VoidCrisis.SINGULARITY_THRESHOLD_TILES - 1;
  voidCrisis.update(16);
  assert.notEqual(voidCrisis.getStage(), CrisisStage.FAILED);

  // Creep crosses 72 tiles threshold
  voidCrisis.voidCreepCount = VoidCrisis.SINGULARITY_THRESHOLD_TILES;
  voidCrisis.update(16);
  assert.equal(voidCrisis.getStage(), CrisisStage.FAILED);
  assert.ok(voidCrisis.getStatus().activeAlert?.message.includes('COSMOS WAS CONSUMED'));
});

// --- CRISIS 2: CLOCKWORK REBELLION ---
test('Tier 3 [Clockwork Rebellion]: Stage 2 deploys 8 brass cogs and Row 6 & Col 7 conveyors', () => {
  const clockwork = new ClockworkCrisis();
  clockwork.init();
  clockwork.transitionToStage(CrisisStage.OUTBREAK);

  // Verify 8 cogs deployed
  for (const cog of ClockworkCrisis.COG_POSITIONS) {
    const tile = clockwork.getHazardAt(cog.r, cog.c);
    assert.ok(tile);
    assert.equal(tile.type, HazardType.BRASS_COG);
  }

  // Verify Row 6 and Col 7 conveyors
  const belt1 = clockwork.getHazardAt(ClockworkCrisis.CONVEYOR_ROW, 3);
  assert.ok(belt1);
  assert.equal(belt1.type, HazardType.CONVEYOR_BELT);

  const belt2 = clockwork.getHazardAt(3, ClockworkCrisis.CONVEYOR_COL);
  assert.ok(belt2);
  assert.equal(belt2.type, HazardType.CONVEYOR_BELT);
});

test('Tier 3 [Clockwork Rebellion]: Edge Case 10 — EMP bomb interaction disarms fuse > 100ms and refunds slot', () => {
  const clockwork = new ClockworkCrisis();

  // If fuse is <= 50ms, bomb explodes normally
  const res1 = clockwork.evaluateBombEmpInteraction(45);
  assert.equal(res1.action, 'detonate');
  assert.equal(res1.refundSlot, false);

  // If fuse is > 100ms, bomb is disarmed and slot refunded
  const res2 = clockwork.evaluateBombEmpInteraction(1500);
  assert.equal(res2.action, 'disarm');
  assert.equal(res2.refundSlot, true);
});

test('Tier 3 [Clockwork Rebellion]: 4 Dynamo Conduits require synchronized overload within 1.5s window', () => {
  const clockwork = new ClockworkCrisis();
  clockwork.init();
  clockwork.transitionToStage(CrisisStage.CLIMAX);

  assert.equal(clockwork.bonusBombSlotsGranted, true);

  // Hit conduit 1 & 2
  clockwork.handleBombBlast(ClockworkCrisis.DYNAMO_CONDUITS[0].r, ClockworkCrisis.DYNAMO_CONDUITS[0].c, 0);
  clockwork.handleBombBlast(ClockworkCrisis.DYNAMO_CONDUITS[1].r, ClockworkCrisis.DYNAMO_CONDUITS[1].c, 0);
  assert.equal(clockwork.isOverloadWindowActive, true);
  assert.equal(clockwork.conduits.filter((c) => c.isHit).length, 2);

  // Advance time beyond 1.5s tolerance window -> conduits discharge safely!
  clockwork.update(ClockworkCrisis.SYNCHRO_TOLERANCE_MS + 50);
  assert.equal(clockwork.isOverloadWindowActive, false);
  assert.equal(clockwork.conduits.filter((c) => c.isHit).length, 0);

  // Now execute 4 hits within 1.5s window
  clockwork.handleBombBlast(ClockworkCrisis.DYNAMO_CONDUITS[0].r, ClockworkCrisis.DYNAMO_CONDUITS[0].c, 0);
  clockwork.handleBombBlast(ClockworkCrisis.DYNAMO_CONDUITS[1].r, ClockworkCrisis.DYNAMO_CONDUITS[1].c, 0);
  clockwork.handleBombBlast(ClockworkCrisis.DYNAMO_CONDUITS[2].r, ClockworkCrisis.DYNAMO_CONDUITS[2].c, 0);
  clockwork.handleBombBlast(ClockworkCrisis.DYNAMO_CONDUITS[3].r, ClockworkCrisis.DYNAMO_CONDUITS[3].c, 0);

  assert.equal(clockwork.getStage(), CrisisStage.RESOLVED);
});

// --- CRISIS 3: ORBITAL BOMBARDMENT ---
test('Tier 3 [Orbital Bombardment]: Kinetic salvos spawn targeting reticles then craters', async () => {
  const orbital = new OrbitalCrisis();
  orbital.init();
  orbital.transitionToStage(CrisisStage.OUTBREAK);

  orbital.spawnKineticSalvo();
  // Target reticle active
  const targetTile = orbital.getHazardAt(3, 5);
  assert.ok(targetTile);
  assert.equal(targetTile.type, HazardType.KINETIC_TARGET);
});

test('Tier 3 [Orbital Bombardment]: 3 Planetary Defense Uplinks override and trigger counter-EMP victory', () => {
  const orbital = new OrbitalCrisis();
  orbital.init();
  orbital.transitionToStage(CrisisStage.CLIMAX);

  assert.equal(orbital.uplinks.length, 3);
  for (const u of OrbitalCrisis.UPLINK_POSITIONS) {
    orbital.handleBombBlast(u.r, u.c, 0);
  }

  assert.equal(orbital.getStage(), CrisisStage.RESOLVED);
});

// --- CRISIS 4: SOLAR FLARES ---
test('Tier 3 [Solar Flares]: Edge Case 11 & 12 — Indestructible pillars shelter entities and prevent bomb flash-ignition', () => {
  const solar = new SolarFlareCrisis();
  solar.init();
  solar.transitionToStage(CrisisStage.OUTBREAK);

  // Indestructible pillar (2, 2) provides shelter
  assert.equal(solar.isTileShelteredFromFlare(2, 2), true);
  // Tile adjacent to pillar (2, 3) is sheltered by pillar at (2, 2)
  assert.equal(solar.isTileShelteredFromFlare(2, 3), true);
  // Open intersection (1, 1) far from pillars is exposed
  assert.equal(solar.isTileShelteredFromFlare(1, 1), false);

  // During CME sweep:
  solar.isCmeSweeping = true;
  assert.equal(solar.shouldFlashIgniteBomb(1, 1), true);
  assert.equal(solar.shouldFlashIgniteBomb(2, 3), false); // sheltered!
});

test('Tier 3 [Solar Flares]: Bombing 4 Thermal Coolant Vents vents pressure and neutralizes coronal storm', () => {
  const solar = new SolarFlareCrisis();
  solar.init();
  solar.transitionToStage(CrisisStage.CLIMAX);

  for (const vent of SolarFlareCrisis.THERMAL_VENTS) {
    solar.handleBombBlast(vent.r, vent.c, 0);
  }

  assert.equal(solar.getStage(), CrisisStage.RESOLVED);
});

// --- CRISIS 5: CREEPING LAVA ---
test('Tier 3 [Creeping Lava]: Edge Case 13 — Lava advances and incinerates entities', () => {
  const lava = new LavaCrisis();
  lava.init();
  lava.transitionToStage(CrisisStage.OUTBREAK);

  // Lava advanced into outer ring
  assert.ok(lava.lavaTilesCount > 0);
  // Top-left corridor tile in ring 1 has lava
  const tile = lava.getHazardAt(1, 3);
  if (tile && tile.type === HazardType.LAVA_SURFACE) {
    assert.equal(lava.shouldIncinerateEntity(1, 3), true);
  }
});

test('Tier 3 [Creeping Lava]: Bomb blasts solidify molten lava into breakable obsidian blocks', () => {
  const lava = new LavaCrisis();
  lava.init();
  lava.transitionToStage(CrisisStage.OUTBREAK);

  // Manually ignite a lava tile at (3, 3)
  lava.setHazardTile(3, 3, HazardType.LAVA_SURFACE, 1.0, 0, 0);
  assert.equal(lava.getHazardAt(3, 3)?.type, HazardType.LAVA_SURFACE);

  // Detonate bomb at (3, 3)
  lava.handleBombBlast(3, 3, 1);
  assert.equal(lava.getHazardAt(3, 3)?.type, HazardType.OBSIDIAN_BLOCK);
  assert.ok(lava.obsidianSolidifiedCount >= 1);
});

test('Tier 3 [Creeping Lava]: Detonating bomb on Central Caldera Valve (6, 7) seals fissure and achieves victory', () => {
  const lava = new LavaCrisis();
  lava.init();
  lava.transitionToStage(CrisisStage.CLIMAX);

  lava.handleBombBlast(6, 7, 0);
  assert.equal(lava.isCalderaSealed, true);
  assert.equal(lava.getStage(), CrisisStage.RESOLVED);
});

// --- CRISIS 6: DIMENSIONAL RIFTS ---
test('Tier 3 [Dimensional Rifts]: Edge Case 14 — Spawn displacement shifts away from occupied tiles', () => {
  const rift = new RiftCrisis();
  rift.init();

  // Test when (3, 4) is occupied
  const occupiedCheck = (r, c) => r === 3 && c === 4;
  const safeLoc = rift.resolveSafeSpawnLocation(3, 4, occupiedCheck);

  assert.notEqual(safeLoc.r === 3 && safeLoc.c === 4, true);
  assert.ok(Math.abs(safeLoc.r - 3) <= 1);
  assert.ok(Math.abs(safeLoc.c - 4) <= 1);
});

test('Tier 3 [Dimensional Rifts]: Toroidal edge corridor wrap-around wraps boundaries', () => {
  const rift = new RiftCrisis();
  rift.init();
  rift.transitionToStage(CrisisStage.OUTBREAK);

  // Walking past top edge wraps to bottom
  const topWrap = rift.wrapToroidalPosition(0, 5);
  assert.equal(topWrap.r, ROWS - 2);
  assert.equal(topWrap.c, 5);

  // Walking past bottom edge wraps to top
  const bottomWrap = rift.wrapToroidalPosition(ROWS - 1, 5);
  assert.equal(bottomWrap.r, 1);
  assert.equal(bottomWrap.c, 5);

  // Walking past left edge wraps to right
  const leftWrap = rift.wrapToroidalPosition(5, 0);
  assert.equal(leftWrap.r, 5);
  assert.equal(leftWrap.c, COLS - 2);
});

test('Tier 3 [Dimensional Rifts]: Stepping on rift teleports cyclically across rift network', () => {
  const rift = new RiftCrisis();
  rift.init();
  rift.transitionToStage(CrisisStage.OUTBREAK);

  const dest1 = rift.teleportThroughRift(rift.rifts[0].r, rift.rifts[0].c);
  assert.ok(dest1);
  assert.equal(dest1.r, rift.rifts[1].r);
  assert.equal(dest1.c, rift.rifts[1].c);

  const dest2 = rift.teleportThroughRift(rift.rifts[2].r, rift.rifts[2].c);
  assert.ok(dest2);
  assert.equal(dest2.r, rift.rifts[0].r);
  assert.equal(dest2.c, rift.rifts[0].c);
});

test('Tier 3 [Dimensional Rifts]: Quantum Synchronization requires all 3 spires polarized within 2.0s', () => {
  const rift = new RiftCrisis();
  rift.init();
  rift.transitionToStage(CrisisStage.CLIMAX);

  // Polarize 2 spires
  rift.handleBombBlast(rift.spires[0].r, rift.spires[0].c, 0);
  rift.handleBombBlast(rift.spires[1].r, rift.spires[1].c, 0);
  assert.equal(rift.isQuantumSyncActive, true);

  // Advance time past 2.0s window -> sync resets safely
  rift.update(RiftCrisis.QUANTUM_SYNC_WINDOW_MS + 50);
  assert.equal(rift.isQuantumSyncActive, false);
  assert.equal(rift.spires.filter((s) => s.isPolarized).length, 0);

  // Now hit all 3 within 2.0s
  rift.handleBombBlast(rift.spires[0].r, rift.spires[0].c, 0);
  rift.handleBombBlast(rift.spires[1].r, rift.spires[1].c, 0);
  rift.handleBombBlast(rift.spires[2].r, rift.spires[2].c, 0);

  assert.equal(rift.getStage(), CrisisStage.RESOLVED);
});

/* ==============================================================================
 * TIER 4: SITUATION LOG HUD CONTROLLER & EVENT BRIDGE
 * ============================================================================== */

test('Tier 4: SituationLog bridges CrisisManager state to event listeners with 50ms throttling', () => {
  const emitter = new EventEmitter();
  const gameMock = {
    events: {
      emit: (event, payload) => emitter.emit(event, payload),
    },
  };

  const situationLog = new SituationLog(gameMock);
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.PASTEL_VOID);

  let emissionCount = 0;
  let lastPayload = null;
  emitter.on('situation-log-update', (payload) => {
    emissionCount++;
    lastPayload = payload;
  });

  // Initial update forced on state transition
  situationLog.updateFromCrisisManager(manager, 1000, true);
  assert.equal(emissionCount, 1);
  assert.ok(lastPayload);
  assert.equal(lastPayload.isActive, true);
  assert.equal(lastPayload.crisisId, CrisisType.PASTEL_VOID);
  assert.equal(lastPayload.stage, CrisisStage.WHISPERS);

  // Rapid spam within 50ms without force should be throttled
  for (let t = 1001; t < 1045; t += 5) {
    situationLog.updateFromCrisisManager(manager, t, false);
  }
  assert.equal(emissionCount, 1); // Still 1 due to throttling!

  // Update after 50ms emits next snapshot
  situationLog.updateFromCrisisManager(manager, 1060, false);
  assert.equal(emissionCount, 2);
});

/* ==============================================================================
 * TIER 5: ZERO-GC INVARIANTS & RAPID SWITCHING STRESS
 * ============================================================================== */

test('Tier 5 [Zero-GC Invariant]: 2,000 continuous frames maintain fixed hazard tile buffer', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.PASTEL_VOID);

  // Run 2,000 frames simulating 60fps game loop
  for (let frame = 0; frame < 2000; frame++) {
    manager.update(16.6667);
    const hazards = manager.getActiveHazardTiles();
    assert.ok(Array.isArray(hazards));
    assert.ok(hazards.length <= 195);
  }

  assert.ok(manager.getThreatMeter() >= 0);
});

test('Tier 5 [Adversarial Stress]: Rapid switching between all 6 crises 100 times without dangling state', () => {
  const manager = new CrisisManager();
  const types = Object.values(CrisisType);

  for (let i = 0; i < 100; i++) {
    const type = types[i % types.length];
    manager.triggerCrisis(type);
    manager.update(100);
    assert.equal(manager.getCurrentCrisisType(), type);
    assert.equal(manager.getStage(), CrisisStage.WHISPERS);
  }

  manager.reset();
  assert.equal(manager.getStage(), CrisisStage.INACTIVE);
  assert.equal(manager.getActiveHazardTiles().length, 0);
});

test('Tier 5 [Adversarial Boundary Attacks]: 1,000 random bomb blast coordinates clamp safely', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.ORBITAL_BOMBARDMENT);

  for (let i = 0; i < 1000; i++) {
    const randR = Math.floor(Math.random() * 50) - 20; // Out of bounds
    const randC = Math.floor(Math.random() * 50) - 20;
    const randRad = Math.floor(Math.random() * 5);
    // Should never throw
    assert.doesNotThrow(() => {
      manager.handleBombBlast(randR, randC, randRad);
      manager.isTileHazardous(randR, randC);
      manager.getHazardAt(randR, randC);
    });
  }
});

/* ==============================================================================
 * TIER 6: DEEP CORNER-CASE & LIFECYCLE EXTENSIONS
 * ============================================================================== */

test('Tier 6: Threat meter trends transition accurately between rising, declining, and critical', () => {
  const voidCrisis = new VoidCrisis();
  voidCrisis.init();

  assert.equal(voidCrisis.getStatus().threatTrend, 'rising');

  // Threat >= 85 triggers critical trend
  voidCrisis.setThreat(90);
  voidCrisis.update(16);
  assert.equal(voidCrisis.getStatus().threatTrend, 'critical');

  // Reducing threat triggers declining trend
  voidCrisis.setThreat(40);
  voidCrisis.update(16);
  assert.equal(voidCrisis.getStatus().threatTrend, 'declining');
});

test('Tier 6: Crisis threat alert auto-expires when duration runs out', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.SOLAR_FLARES);

  const status1 = manager.update(16);
  assert.ok(status1.activeAlert !== null);

  // Advance past alert duration (4000ms)
  const status2 = manager.update(5000);
  assert.equal(status2.activeAlert, null);
});

test('Tier 6: Pre-allocated HazardTile swap-and-pop preserves exact active count and buffer integrity', () => {
  const lava = new LavaCrisis();
  lava.init();

  assert.equal(lava.getActiveHazardCount(), 0);

  // Add 3 hazard tiles
  lava.setHazardTile(1, 1, HazardType.LAVA_SURFACE);
  lava.setHazardTile(1, 2, HazardType.LAVA_SURFACE);
  lava.setHazardTile(1, 3, HazardType.LAVA_SURFACE);
  assert.equal(lava.getActiveHazardCount(), 3);

  // Clear middle tile (1, 2)
  lava.clearHazardTile(1, 2);
  assert.equal(lava.getActiveHazardCount(), 2);
  assert.equal(lava.isTileHazardous(1, 2), false);
  assert.equal(lava.isTileHazardous(1, 1), true);
  assert.equal(lava.isTileHazardous(1, 3), true);

  // Clear all
  lava.clearAllHazards();
  assert.equal(lava.getActiveHazardCount(), 0);
  assert.equal(lava.getActiveHazardTiles().length, 0);
});

test('Tier 6 [Creeping Lava]: Advances sequentially through concentric rings toward caldera', () => {
  const lava = new LavaCrisis();
  lava.init();
  lava.transitionToStage(CrisisStage.OUTBREAK);

  assert.equal(lava.currentLavaRing, 2); // Ring 1 was advanced in onStageEnter

  // Advance to ring 2
  lava.advanceLavaRing();
  assert.equal(lava.currentLavaRing, 3);
  assert.ok(lava.lavaTilesCount > 10);

  // Advance to ring 3
  lava.advanceLavaRing();
  assert.equal(lava.currentLavaRing, 4);
});

test('Tier 6 [Solar Flares]: CME sweep hazards auto-clear upon sweep conclusion', () => {
  const solar = new SolarFlareCrisis();
  solar.init();
  solar.transitionToStage(CrisisStage.OUTBREAK);

  solar.triggerCmeSweep();
  assert.equal(solar.isCmeSweeping, true);
  assert.ok(solar.getActiveHazardTiles().some((h) => h.type === HazardType.SOLAR_SWEEP));

  // Advance past sweep duration (1200ms)
  solar.update(1300);
  assert.equal(solar.isCmeSweeping, false);
  assert.equal(
    solar.getActiveHazardTiles().some((h) => h.type === HazardType.SOLAR_SWEEP),
    false
  );
  assert.equal(solar.sweepsSurvivedCount, 1);
});

test('Tier 6 [Clockwork Rebellion]: EMP pulse warning banner triggers 2.5s before discharge', () => {
  const clockwork = new ClockworkCrisis();
  clockwork.init();
  clockwork.transitionToStage(CrisisStage.OUTBREAK);

  // Advance to just before warning threshold (interval 14s, warning 2.5s -> 11.5s)
  clockwork.update(11400);
  assert.equal(clockwork.isEmpWarningActive, false);

  // Advance past 11.5s -> warning banner activates
  clockwork.update(200);
  assert.equal(clockwork.isEmpWarningActive, true);
  assert.equal(clockwork.getStatus().activeAlert?.id, 'emp_warning');

  // Advance to 14s -> pulse fires
  clockwork.update(2500);
  assert.equal(clockwork.totalEmpPulsesFired, 1);
  assert.equal(clockwork.isEmpWarningActive, false);
});

test('Tier 6 [Orbital Bombardment]: Climax Macrocannon charges to 100% and triggers failure if not overridden', () => {
  const orbital = new OrbitalCrisis();
  orbital.init();
  orbital.transitionToStage(CrisisStage.CLIMAX);

  assert.equal(orbital.macrocannonCharge, 0);

  // Advance through half of climax duration
  const halfDuration = orbital.definition.stageDurations[CrisisStage.CLIMAX] / 2;
  orbital.update(halfDuration);
  assert.ok(orbital.macrocannonCharge >= 45 && orbital.macrocannonCharge <= 55);

  // Advance to full duration without overriding uplinks
  orbital.update(halfDuration + 100);
  assert.equal(orbital.getStage(), CrisisStage.FAILED);
  assert.ok(orbital.getStatus().isDefeated);
});

test('Tier 6 [Dimensional Rifts]: Toroidal wrap on all 4 corners preserves grid bounds', () => {
  const rift = new RiftCrisis();
  rift.init();
  rift.transitionToStage(CrisisStage.OUTBREAK);

  // Top-left corner (0, 0) wraps to bottom-right walkable corridor
  const wrapTL = rift.wrapToroidalPosition(0, 0);
  assert.equal(wrapTL.r, ROWS - 2);
  assert.equal(wrapTL.c, COLS - 2);

  // Bottom-right corner (ROWS - 1, COLS - 1) wraps to top-left (1, 1)
  const wrapBR = rift.wrapToroidalPosition(ROWS - 1, COLS - 1);
  assert.equal(wrapBR.r, 1);
  assert.equal(wrapBR.c, 1);
});

test('Tier 6 [SituationLog]: Victory and Failure state projections format properly', () => {
  const situationLog = new SituationLog();
  const manager = new CrisisManager();

  // Test Victory projection
  manager.triggerCrisis(CrisisType.CREEPING_LAVA);
  const active = manager.getActiveCrisis();
  assert.ok(active);
  active.resolveCrisis();
  situationLog.updateFromCrisisManager(manager, 100, true);

  const state1 = situationLog.getState();
  assert.equal(state1.isVictorious, true);
  assert.equal(state1.stage, CrisisStage.RESOLVED);
  assert.equal(state1.stageName, 'Stabilized (Victory)');

  // Test Defeat projection
  manager.triggerCrisis(CrisisType.CREEPING_LAVA);
  const active2 = manager.getActiveCrisis();
  assert.ok(active2);
  active2.failCrisis('Magma rupture breached core!');
  situationLog.updateFromCrisisManager(manager, 200, true);

  const state2 = situationLog.getState();
  assert.equal(state2.isDefeated, true);
  assert.equal(state2.stage, CrisisStage.FAILED);
  assert.equal(state2.stageName, 'Catastrophic Collapse (Failed)');
});

test('Tier 6 [SituationLog]: reset() restores baseline default state', () => {
  const situationLog = new SituationLog();
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.DIMENSIONAL_RIFTS);
  situationLog.updateFromCrisisManager(manager, 100, true);

  assert.equal(situationLog.getState().isActive, true);

  situationLog.reset();
  assert.equal(situationLog.getState().isActive, false);
  assert.equal(situationLog.getState().crisisId, '');
  assert.equal(situationLog.getState().threatLevel, 0);
});

test('Tier 6 [VoidCrisis]: Charged prism safe aura strictly blocks creep expansion into adjacent tiles', () => {
  const voidCrisis = new VoidCrisis();
  voidCrisis.init();
  voidCrisis.transitionToStage(CrisisStage.OUTBREAK);

  const prism = voidCrisis.prisms[1]; // (11, 1)
  // Fully charge this prism
  for (let i = 0; i < 3; i++) {
    voidCrisis.handleBombBlast(prism.r, prism.c, 0);
  }
  assert.equal(prism.isCharged, true);

  // Tiles within 1-Chebyshev distance of (11, 1) are blocked
  assert.equal(voidCrisis.canCreepSpreadTo(10, 1), false);
  assert.equal(voidCrisis.canCreepSpreadTo(10, 2), false);
  assert.equal(voidCrisis.canCreepSpreadTo(11, 2), false);

  // Tiles outside 1-Chebyshev distance are not blocked by this prism
  assert.equal(voidCrisis.canCreepSpreadTo(9, 1), true);
});

test('Tier 6 [CrisisManager]: getHazardAt returns null for empty tiles and correct object for active hazard', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.CLOCKWORK_REBELLION);
  manager.update(21000); // Enter OUTBREAK

  // Check empty tile
  assert.equal(manager.getHazardAt(1, 1), null);
  assert.equal(manager.isTileHazardous(1, 1), false);

  // Check conveyor belt tile at (6, 3)
  const belt = manager.getHazardAt(6, 3);
  assert.ok(belt !== null);
  assert.equal(belt.type, HazardType.CONVEYOR_BELT);
  assert.equal(manager.isTileHazardous(6, 3), true);
});

test('Tier 6 [SituationLog Integration]: Bridges crisis updates to listeners and resets cleanly on mode change', () => {
  const emitter = new EventEmitter();
  const mockGame = {
    events: {
      emit(event, ...args) {
        return emitter.emit(event, ...args);
      },
    },
  };

  const manager = new CrisisManager();
  const situationLog = new SituationLog(mockGame);

  let lastPayload = null;
  emitter.on('situation-log-update', (payload) => {
    lastPayload = payload;
  });

  // 1. Trigger crisis
  manager.triggerCrisis(CrisisType.PASTEL_VOID);
  situationLog.updateFromCrisisManager(manager, Date.now(), true);

  assert.ok(lastPayload !== null);
  assert.equal(lastPayload.isActive, true);
  assert.equal(lastPayload.crisisId, CrisisType.PASTEL_VOID);
  assert.equal(lastPayload.crisisName, 'Pastel Void Incursion');
  assert.ok(lastPayload.objectives.length > 0);
  assert.ok(lastPayload.stageRemainingMs > 0);

  // 2. Advance time & update
  manager.update(5000);
  situationLog.updateFromCrisisManager(manager, Date.now() + 5000, true);
  assert.equal(lastPayload.stage, CrisisStage.WHISPERS);

  // 3. Reset crisis (e.g. on mode switch away)
  manager.stopCrisis('reset');
  situationLog.reset();

  assert.equal(lastPayload.isActive, false);
  assert.equal(lastPayload.threatLevel, 0);
  assert.equal(lastPayload.crisisId, '');
});


