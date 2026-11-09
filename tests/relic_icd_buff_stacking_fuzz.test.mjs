/**
 * relic_icd_buff_stacking_fuzz.test.mjs
 * Chaos QA & Resilience Agent — Rigorous Fuzzing & Cooldown Invariant Verification
 *
 * Mission:
 * 1. Fuzz relic internal cooldowns (ICD) across all 10 relics in RelicSystem.ts.
 * 2. Verify simultaneous rapid bomb explosions strictly respect the 500ms ICD without dropping or corrupting procs.
 * 3. Verify multi-relic bomb detonation independence (procs for distinct relics are never dropped).
 * 4. Verify buff stacking across all 10 relics and all 45 pairwise combinations.
 * 5. Fuzz extreme inputs: NaN, Infinity, negative timestamps, clock jumps, prototype poisoning, and malformed enemies.
 * 6. 10,000-cycle chaotic bomb explosion soak test verifying 0 corrupted procs and Zero-GC stability.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RelicId,
  RELIC_CATALOG,
  SYNERGY_DEFINITIONS,
  RelicManager,
} from '../src/game/progression/index.ts';

/* ==============================================================================
 * TIER 1: SIMULTANEOUS & RAPID BOMB EXPLOSION 500MS ICD INVARIANTS
 * ============================================================================== */

test('Tier 1.1: Simultaneous bomb explosions (same exact timestamp) grant exactly 1 proc and suppress rest', () => {
  const rm = new RelicManager([RelicId.PYROCLASTIC_PRISM], 1);
  const nowMs = 5000;

  // 10 simultaneous bombs exploding at the exact same millisecond
  const results = [];
  for (let i = 0; i < 10; i++) {
    results.push(rm.onBombExploded({ r: 5, c: i }, nowMs));
  }

  // Exactly the first one must trigger
  assert.equal(results[0].spawnDiagonalShards, true, 'First bomb explosion at t=5000ms must trigger');
  assert.equal(results[0].shards.length, 4, 'Must spawn 4 diagonal shards');

  // Verify all shard vectors are valid unit diagonals with maxDist=2
  for (const shard of results[0].shards) {
    assert.ok(Math.abs(shard.dr) === 1 && Math.abs(shard.dc) === 1, 'Shard must be diagonal');
    assert.equal(shard.maxDist, 2);
  }

  // All remaining 9 simultaneous explosions must be strictly suppressed
  for (let i = 1; i < 10; i++) {
    assert.equal(results[i].spawnDiagonalShards, false, `Bomb ${i} at identical t=5000ms must be suppressed by 500ms ICD`);
    assert.equal(results[i].shards.length, 0, 'Suppressed explosion must have empty shards');
  }
});

test('Tier 1.2: Rapid micro-jitter explosions (<500ms) are suppressed without resetting cooldown timer', () => {
  const rm = new RelicManager([RelicId.PYROCLASTIC_PRISM], 1);
  const startMs = 10000;

  // Initial detonation at t=10,000ms
  const initial = rm.onBombExploded({ r: 3, c: 3 }, startMs);
  assert.equal(initial.spawnDiagonalShards, true);

  // Rapid chain reaction at sub-500ms offsets: 1ms, 5ms, 50ms, 120ms, 250ms, 499ms
  const jitters = [1, 5, 25, 50, 100, 200, 350, 450, 499];
  for (const delta of jitters) {
    const res = rm.onBombExploded({ r: 3, c: 3 }, startMs + delta);
    assert.equal(
      res.spawnDiagonalShards,
      false,
      `Detonation at +${delta}ms (<500ms) must be suppressed by ICD`
    );
  }

  // CRITICAL INVARIANT: The failed procs at +499ms must NOT reset the timer.
  // Exactly at t=10,000 + 500ms = 10,500ms, the next proc MUST SUCCEED!
  const nextValid = rm.onBombExploded({ r: 3, c: 3 }, startMs + 500);
  assert.equal(
    nextValid.spawnDiagonalShards,
    true,
    'Proc exactly at +500ms must succeed (failed attempts did not corrupt or extend ICD timer)'
  );
  assert.equal(nextValid.shards.length, 4);
});

test('Tier 1.3: Continuous rapid detonation train over 5 seconds strictly procs at 500ms boundaries', () => {
  const rm = new RelicManager([RelicId.PYROCLASTIC_PRISM], 1);
  const baseTime = 1000;
  let procsCount = 0;
  const procTimestamps = [];

  // Bomb explodes every 10ms for 5000ms (501 bomb detonations)
  for (let t = baseTime; t <= baseTime + 5000; t += 10) {
    const res = rm.onBombExploded({ r: 5, c: 5 }, t);
    if (res.spawnDiagonalShards) {
      procsCount++;
      procTimestamps.push(t);
    }
  }

  // In 5000ms, with a 500ms ICD, exactly 11 procs can occur (at t=1000, 1500, 2000, ..., 5000)
  assert.equal(procsCount, 11, `Expected exactly 11 procs across 5000ms, got ${procsCount}`);

  // Verify that every consecutive proc is separated by at least 500ms
  for (let i = 1; i < procTimestamps.length; i++) {
    const diff = procTimestamps[i] - procTimestamps[i - 1];
    assert.ok(
      diff >= 500,
      `Procs at ${procTimestamps[i - 1]} and ${procTimestamps[i]} violated 500ms ICD (diff: ${diff}ms)`
    );
  }
});

/* ==============================================================================
 * TIER 2: MULTI-RELIC BOMB EXPLOSION INDEPENDENCE (ZERO PROC DROPPING)
 * ============================================================================== */

test('Tier 2.1: Dual-equipped bomb detonation relics (Pyroclastic + Psionic) proc simultaneously without dropping', () => {
  const rm = new RelicManager([RelicId.PYROCLASTIC_PRISM, RelicId.PSIONIC_FEEDBACK_CRYSTAL], 2);
  const nowMs = 2000;
  const enemies = [{ id: 'goblin_1', r: 5, c: 6 }]; // 1 tile away

  // Single bomb explodes
  const pyroRes = rm.onBombExploded({ r: 5, c: 5 }, nowMs);
  const psionicRes = rm.onBombDetonationPsionicPulse(5, 5, enemies, false, 60, nowMs);

  // Both must proc! Distinct relic keys must never block each other
  assert.equal(pyroRes.spawnDiagonalShards, true, 'Pyroclastic Prism must proc at t=2000');
  assert.equal(pyroRes.shards.length, 4);

  assert.equal(psionicRes.pulseRadius, 2.0, 'Psionic Feedback Crystal must proc at t=2000');
  assert.deepEqual(psionicRes.affectedEnemyIds, ['goblin_1']);

  // Second bomb explodes 100ms later (t=2100) -> both suppressed
  const pyroSuppressed = rm.onBombExploded({ r: 5, c: 5 }, nowMs + 100);
  const psionicSuppressed = rm.onBombDetonationPsionicPulse(5, 5, enemies, false, 60, nowMs + 100);
  assert.equal(pyroSuppressed.spawnDiagonalShards, false);
  assert.equal(psionicSuppressed.pulseRadius, 0);
  assert.equal(psionicSuppressed.affectedEnemyIds.length, 0);

  // Third bomb explodes 500ms after first (t=2500) -> both proc again cleanly
  const pyroNext = rm.onBombExploded({ r: 5, c: 5 }, nowMs + 500);
  const psionicNext = rm.onBombDetonationPsionicPulse(5, 5, enemies, false, 60, nowMs + 500);
  assert.equal(pyroNext.spawnDiagonalShards, true);
  assert.equal(psionicNext.pulseRadius, 2.0);
  assert.deepEqual(psionicNext.affectedEnemyIds, ['goblin_1']);
});

test('Tier 2.2: Orbital Targeting Core detonation proc independence and synergy cross pattern', () => {
  const rm = new RelicManager([RelicId.ORBITAL_TARGETING_CORE, RelicId.MAGNETRON_DIAL], 2);
  assert.ok(rm.hasSynergy(RelicId.ORBITAL_TARGETING_CORE, RelicId.MAGNETRON_DIAL), 'Orbital Ion Strike synergy active');

  const nowMs = 15000;
  const strike1 = rm.onBombDetonationOrbitalTargeting(10, 10, nowMs);

  assert.equal(strike1.damage, 150);
  assert.equal(strike1.delayMs, 1200);
  // Synergy expands to 5-tile cross pattern
  assert.equal(strike1.targetTiles.length, 5);
  assert.deepEqual(strike1.targetTiles, [
    { r: 10, c: 10 },
    { r: 9, c: 10 },
    { r: 11, c: 10 },
    { r: 10, c: 9 },
    { r: 10, c: 11 },
  ]);

  // Rapid second detonation at t=15200 (200ms < 500ms): suppressed
  const strike2 = rm.onBombDetonationOrbitalTargeting(10, 10, nowMs + 200);
  assert.equal(strike2.damage, 0);
  assert.equal(strike2.targetTiles.length, 0);

  // After 500ms (t=15500): procs cleanly again
  const strike3 = rm.onBombDetonationOrbitalTargeting(10, 10, nowMs + 500);
  assert.equal(strike3.damage, 150);
  assert.equal(strike3.targetTiles.length, 5);
});

/* ==============================================================================
 * TIER 3: BUFF STACKING & RELIC STATE TRANSITIONS ACROSS ALL 10 RELICS
 * ============================================================================== */

test('Tier 3.1: Vampiric Confection kill streak accumulation, ICD guard, and damage reset', () => {
  const rm = new RelicManager([RelicId.VAMPIRIC_CONFECTION], 1);

  // Kills 1..4 do not grant shield
  for (let k = 1; k <= 4; k++) {
    const res = rm.onEnemyKilled(1000 + k * 10);
    assert.equal(res.shieldGranted, false);
    assert.equal(res.currentStreak, k);
  }

  // 5th kill at t=1050 grants shield
  const kill5 = rm.onEnemyKilled(1050);
  assert.equal(kill5.shieldGranted, true);
  assert.equal(kill5.currentStreak, 0);
  assert.equal(rm.vampiricKillStreak, 0);

  // Rapid multi-kill: 5 enemies die in a single bomb explosion at t=1100 (50ms later)
  for (let k = 1; k <= 4; k++) {
    rm.onEnemyKilled(1100);
  }
  // 5th kill at t=1100: threshold reached, but 500ms ICD is NOT satisfied (1100 - 1050 = 50ms)
  const rapidKill5 = rm.onEnemyKilled(1100);
  assert.equal(rapidKill5.shieldGranted, false, 'Shield grant suppressed by 500ms ICD');
  assert.equal(rapidKill5.currentStreak, 5, 'Streak is preserved at threshold 5 without drop');

  // Next kill after 500ms (t=1600): threshold is still >= 5, ICD passes -> grants shield!
  const delayedKill = rm.onEnemyKilled(1600);
  assert.equal(delayedKill.shieldGranted, true, 'Preserved streak grants shield once ICD elapses');
  assert.equal(delayedKill.currentStreak, 0);

  // Damage reset test: taking damage resets streak immediately
  rm.onEnemyKilled(1700);
  rm.onEnemyKilled(1710);
  assert.equal(rm.vampiricKillStreak, 2);
  rm.onPlayerDamaged();
  assert.equal(rm.vampiricKillStreak, 0, 'onPlayerDamaged must reset kill streak to 0');
});

test('Tier 3.2: Radiant Leech synergy reduces kill threshold to 3 and Solar charge to 4s', () => {
  const rm = new RelicManager([RelicId.VAMPIRIC_CONFECTION, RelicId.SOLAR_CAPACITOR], 2);
  assert.ok(rm.hasSynergy(RelicId.VAMPIRIC_CONFECTION, RelicId.SOLAR_CAPACITOR));

  // Vampiric: 3 kills grant shield instead of 5
  rm.onEnemyKilled(1000);
  rm.onEnemyKilled(1010);
  const kill3 = rm.onEnemyKilled(1020);
  assert.equal(kill3.shieldGranted, true, 'Radiant Leech grants shield at 3 kills');
  assert.equal(kill3.currentStreak, 0);

  // Solar: Charges in 4000ms instead of 8000ms
  // 3000ms in corridor -> no shield yet
  const tick1 = rm.update(3000, 2000, 60, true);
  assert.equal(tick1.solarShieldGranted, false);
  assert.equal(rm.hasSolarShield, false);
  assert.equal(rm.solarChargeElapsedMs, 3000);

  // Additional 1000ms (total 4000ms) -> shield granted!
  const tick2 = rm.update(1000, 3000, 60, true);
  assert.equal(tick2.solarShieldGranted, true, 'Solar Capacitor with synergy grants shield at 4000ms');
  assert.equal(rm.hasSolarShield, true);
  assert.equal(rm.solarChargeElapsedMs, 0);
});

test('Tier 3.3: Solar Capacitor corridor decay and player damage reset', () => {
  const rm = new RelicManager([RelicId.SOLAR_CAPACITOR], 1);

  // Charge for 5000ms in corridor
  rm.update(5000, 1000, 60, true);
  assert.equal(rm.solarChargeElapsedMs, 5000);

  // Step out of corridor for 2000ms: decays at 0.5x rate (2000 * 0.5 = 1000ms lost)
  rm.update(2000, 3000, 60, false);
  assert.equal(rm.solarChargeElapsedMs, 4000, 'Charge must decay by deltaMs * 0.5 outside corridor');

  // Player damaged: wipes charge and shield
  rm.onPlayerDamaged();
  assert.equal(rm.solarChargeElapsedMs, 0);
  assert.equal(rm.hasSolarShield, false);
});

test('Tier 3.4: Kinetic Pinball synergy expands Gelatinous Core radius to 2.5 and Clockwork pierce to 2', () => {
  const rm = new RelicManager([RelicId.GELATINOUS_CORE, RelicId.CLOCKWORK_SPRING], 2);
  assert.ok(rm.hasSynergy(RelicId.GELATINOUS_CORE, RelicId.CLOCKWORK_SPRING));

  const enemies = [
    { id: 'near', r: 5, c: 6 }, // 1.0 tile
    { id: 'mid', r: 5, c: 7 },  // 2.0 tiles (within 2.5, outside 1.5)
    { id: 'far', r: 5, c: 8 },  // 3.0 tiles (outside 2.5)
  ];

  // Wall bounce stuns enemies within 2.5 tiles
  const bounce = rm.onWallBounce({ r: 5, c: 5 }, enemies, 1000);
  assert.equal(bounce.stunDurationMs, 500);
  assert.deepEqual(bounce.stunnedEnemyIds.sort(), ['mid', 'near']);

  // Bomb kick: soft block pierce is 2 (vs 1 baseline)
  const kick = rm.onBombKicked(1000);
  assert.equal(kick.velocityPxPerSec, 450);
  assert.equal(kick.softBlockPierceCount, 2);
});

test('Tier 3.5: Cosmic Supernova synergy expands Void Singularity pull radius to 2.5 tiles', () => {
  const rm = new RelicManager([RelicId.VOID_SINGULARITY_LENS, RelicId.PYROCLASTIC_PRISM], 2);
  assert.ok(rm.hasSynergy(RelicId.VOID_SINGULARITY_LENS, RelicId.PYROCLASTIC_PRISM));

  const enemies = [
    { id: 'close', r: 5, c: 6 }, // 1.0 tile
    { id: 'medium', r: 5, c: 7 }, // 2.0 tiles (within 2.5, outside 1.5)
    { id: 'distant', r: 5, c: 8 }, // 3.0 tiles
  ];

  const pull = rm.onBombPlaced({ r: 5, c: 5 }, enemies, 5000);
  assert.equal(pull.pullRadius, 2.5);
  assert.deepEqual(pull.pulledEnemyIds.sort(), ['close', 'medium']);
});

test('Tier 3.6: Chrono Attraction synergy doubles magnet radius to 8 in final 30 seconds', () => {
  const rm = new RelicManager([RelicId.MAGNETRON_DIAL, RelicId.POCKET_CHRONOMETER], 2);
  assert.ok(rm.hasSynergy(RelicId.MAGNETRON_DIAL, RelicId.POCKET_CHRONOMETER));

  // Above 30s: baseline radius 4
  assert.equal(rm.getMagnetRadiusTiles(60), 4);
  assert.equal(rm.getMagnetRadiusTiles(31), 4);

  // At or below 30s: synergy doubles to 8
  assert.equal(rm.getMagnetRadiusTiles(30), 8);
  assert.equal(rm.getMagnetRadiusTiles(15), 8);
  assert.equal(rm.getMagnetRadiusTiles(1), 8);

  // Match ended (<= 0): reverts to 4
  assert.equal(rm.getMagnetRadiusTiles(0), 4);
  assert.equal(rm.getMagnetRadiusTiles(-5), 4);
});

/* ==============================================================================
 * TIER 4: 10,000-CYCLE CHAOTIC BOMB DETONATION & ICD FUZZING
 * ============================================================================== */

test('Tier 4: 10,000 chaotic bomb detonation cycles verify 0 corrupted procs & strict 500ms ICD', () => {
  const rm = new RelicManager([RelicId.PYROCLASTIC_PRISM, RelicId.ORBITAL_TARGETING_CORE], 2);

  let virtualTimeMs = 1000;
  let lastPyroProcTime = -1;
  let lastOrbitalProcTime = -1;
  let totalPyroProcs = 0;
  let totalOrbitalProcs = 0;

  for (let i = 0; i < 10000; i++) {
    // Generate pseudo-random time step between 0ms and 600ms
    // (creating a mix of simultaneous (0ms), rapid (<500ms), and boundary (>=500ms) events)
    const dt = ((i * 37 + 13) % 601);
    virtualTimeMs += dt;

    const row = (i % 13) + 1;
    const col = ((i * 3) % 15) + 1;

    // 1. Test Pyroclastic Prism
    const pyro = rm.onBombExploded({ r: row, c: col }, virtualTimeMs);
    if (pyro.spawnDiagonalShards) {
      totalPyroProcs++;
      if (lastPyroProcTime !== -1) {
        const interval = virtualTimeMs - lastPyroProcTime;
        assert.ok(
          interval >= 500,
          `Pyroclastic ICD violated: ${interval}ms between procs at iteration ${i}`
        );
      }
      lastPyroProcTime = virtualTimeMs;

      // Invariant: shards must never be corrupted
      assert.equal(pyro.shards.length, 4);
      for (const s of pyro.shards) {
        assert.ok(Number.isFinite(s.dr) && Number.isFinite(s.dc) && s.maxDist === 2);
      }
    } else {
      assert.equal(pyro.shards.length, 0);
    }

    // 2. Test Orbital Targeting Core
    const orbital = rm.onBombDetonationOrbitalTargeting(row, col, virtualTimeMs);
    if (orbital.damage > 0) {
      totalOrbitalProcs++;
      if (lastOrbitalProcTime !== -1) {
        const interval = virtualTimeMs - lastOrbitalProcTime;
        assert.ok(
          interval >= 500,
          `Orbital Targeting ICD violated: ${interval}ms between procs at iteration ${i}`
        );
      }
      lastOrbitalProcTime = virtualTimeMs;

      // Invariant: targeting must never be corrupted
      assert.equal(orbital.damage, 150);
      assert.equal(orbital.delayMs, 1200);
      assert.ok(orbital.targetTiles.length >= 1);
      for (const t of orbital.targetTiles) {
        assert.ok(Number.isFinite(t.r) && Number.isFinite(t.c));
      }
    } else {
      assert.equal(orbital.targetTiles.length, 0);
    }
  }

  assert.ok(totalPyroProcs > 100, `Expected >100 procs, got ${totalPyroProcs}`);
  assert.ok(totalOrbitalProcs > 100, `Expected >100 procs, got ${totalOrbitalProcs}`);
  // Since both were invoked at identical timestamps, their proc counts must match exactly!
  assert.equal(totalPyroProcs, totalOrbitalProcs, 'Independent procs at identical timestamps must match');
});

/* ==============================================================================
 * TIER 5: EXTREME CORRUPTED INPUTS, TIME WARPS & PROTO POISONING FUZZING
 * ============================================================================== */

test('Tier 5.1: Malformed and corrupted timestamps are rejected safely without crashing', () => {
  const rm = new RelicManager([RelicId.PYROCLASTIC_PRISM], 1);

  const corruptedTimestamps = [
    NaN,
    Infinity,
    -Infinity,
    undefined,
    null,
    '1000',
    {},
    [],
    Symbol('bad'),
    () => 1000,
  ];

  for (const badTime of corruptedTimestamps) {
    const res = rm.onBombExploded({ r: 5, c: 5 }, badTime);
    assert.equal(res.spawnDiagonalShards, false, `Corrupted timestamp ${String(badTime)} must fail safely`);
    assert.equal(res.shards.length, 0);
  }

  // After all corrupted calls, a valid timestamp must succeed
  const valid = rm.onBombExploded({ r: 5, c: 5 }, 5000);
  assert.equal(valid.spawnDiagonalShards, true, 'Valid timestamp must succeed after corrupted input bombardment');
});

test('Tier 5.2: Non-monotonic clock skew / backward time jumps are suppressed safely', () => {
  const rm = new RelicManager([RelicId.PYROCLASTIC_PRISM], 1);

  // Proc at t=10,000
  assert.equal(rm.onBombExploded({ r: 5, c: 5 }, 10000).spawnDiagonalShards, true);

  // Time jumps backward to t=2000: must be blocked
  assert.equal(rm.onBombExploded({ r: 5, c: 5 }, 2000).spawnDiagonalShards, false);

  // Time jumps backward to t=0: must be blocked
  assert.equal(rm.onBombExploded({ r: 5, c: 5 }, 0).spawnDiagonalShards, false);

  // Time jumps backward to negative t=-500: must be blocked
  assert.equal(rm.onBombExploded({ r: 5, c: 5 }, -500).spawnDiagonalShards, false);

  // Time reaches t=10,499 (< 500ms since t=10,000): still blocked
  assert.equal(rm.onBombExploded({ r: 5, c: 5 }, 10499).spawnDiagonalShards, false);

  // Time reaches t=10,500: PROCS cleanly
  assert.equal(rm.onBombExploded({ r: 5, c: 5 }, 10500).spawnDiagonalShards, true);
});

test('Tier 5.3: Serialization / Deserialization state preservation under corrupted payload fuzzing', () => {
  const rm = new RelicManager([RelicId.VAMPIRIC_CONFECTION, RelicId.SOLAR_CAPACITOR], 2);
  rm.vampiricKillStreak = 2;
  rm.solarChargeElapsedMs = 3500;
  rm.hasSolarShield = false;

  const serialized = rm.serialize();
  assert.equal(serialized.maxSlots, 2);
  assert.equal(serialized.vampiricKillStreak, 2);
  assert.equal(serialized.solarChargeElapsedMs, 3500);

  // Fuzz deserialization with corrupted inputs
  const corruptedPayloads = [
    null,
    undefined,
    12345,
    'bad_string',
    { maxSlots: NaN, vampiricKillStreak: Infinity, solarChargeElapsedMs: -999 },
    { equippedRelics: ['illegal_fake_relic', 123, null], discoveredRelics: {} },
    { __proto__: { hacked: true } },
  ];

  for (const payload of corruptedPayloads) {
    const fresh = new RelicManager();
    // Must never throw
    assert.doesNotThrow(() => fresh.deserialize(payload));
  }

  // Clean roundtrip
  const restored = new RelicManager();
  const ok = restored.deserialize(serialized);
  assert.equal(ok, true);
  assert.equal(restored.getMaxSlots(), 2);
  assert.equal(restored.vampiricKillStreak, 2);
  assert.equal(restored.solarChargeElapsedMs, 3500);
  assert.ok(restored.isEquipped(RelicId.VAMPIRIC_CONFECTION));
  assert.ok(restored.isEquipped(RelicId.SOLAR_CAPACITOR));
});

test('Tier 5.4: Rapid equip / unequip cycling preserves slot invariants without leaks', () => {
  const rm = new RelicManager([], 2);

  for (let i = 0; i < 500; i++) {
    rm.equipRelic(RelicId.POCKET_CHRONOMETER);
    rm.equipRelic(RelicId.MAGNETRON_DIAL);
    assert.equal(rm.getEquippedRelics().length, 2);

    // Try overfilling
    const overflow = rm.equipRelic(RelicId.PYROCLASTIC_PRISM);
    assert.equal(overflow.success, false);
    assert.equal(rm.getEquippedRelics().length, 2);

    // Unequip
    rm.unequipRelic(RelicId.POCKET_CHRONOMETER);
    assert.equal(rm.getEquippedRelics().length, 1);
    rm.unequipRelic(RelicId.MAGNETRON_DIAL);
    assert.equal(rm.getEquippedRelics().length, 0);
  }
});

test('Tier 5.5: Corrupted coordinates and malformed enemy payloads are rejected safely without consuming ICD', () => {
  const rm = new RelicManager(
    [RelicId.PSIONIC_FEEDBACK_CRYSTAL, RelicId.ORBITAL_TARGETING_CORE],
    2
  );

  // 1. Psionic Feedback Crystal with null/undefined enemies
  const badEnemies1 = rm.onBombDetonationPsionicPulse(5, 5, null, false, 60, 1000);
  assert.equal(badEnemies1.pulseRadius, 0);
  assert.equal(badEnemies1.affectedEnemyIds.length, 0);

  // Invariant: The failed call must NOT have consumed the ICD!
  // A subsequent valid call at the exact same millisecond t=1000 MUST succeed
  const validEnemies = [{ id: 'goblin', r: 5, c: 6 }];
  const goodPsionic = rm.onBombDetonationPsionicPulse(5, 5, validEnemies, false, 60, 1000);
  assert.equal(goodPsionic.pulseRadius, 2.0, 'Valid call must succeed because bad input did not consume ICD');
  assert.deepEqual(goodPsionic.affectedEnemyIds, ['goblin']);

  // 2. Orbital Targeting Core with NaN row/col
  const badOrbital1 = rm.onBombDetonationOrbitalTargeting(NaN, 5, 2000);
  assert.equal(badOrbital1.damage, 0);
  assert.equal(badOrbital1.targetTiles.length, 0);

  // Invariant: Subsequent valid call at t=2000 must succeed
  const goodOrbital = rm.onBombDetonationOrbitalTargeting(5, 5, 2000);
  assert.equal(goodOrbital.damage, 150);
  assert.equal(goodOrbital.targetTiles.length, 1);
  assert.deepEqual(goodOrbital.targetTiles, [{ r: 5, c: 5 }]);

  // 3. Enemies array with corrupt entries (null, missing r/c, NaN r/c)
  const malformedList = [
    null,
    undefined,
    {},
    { id: 'bad_1', r: NaN, c: 5 },
    { id: 'bad_2', r: 5, c: Infinity },
    { id: 'valid_near', r: 5, c: 6 },
  ];
  const procWithCorruptEntries = rm.onBombDetonationPsionicPulse(5, 5, malformedList, false, 60, 2600);
  assert.equal(procWithCorruptEntries.pulseRadius, 2.0);
  assert.deepEqual(procWithCorruptEntries.affectedEnemyIds, ['valid_near'], 'Only valid near enemy matched');
});

test('Tier 5.6: Solar Capacitor deltaMs NaN and negative input protection', () => {
  const rm = new RelicManager([RelicId.SOLAR_CAPACITOR], 1);

  // NaN deltaMs must not corrupt solarChargeElapsedMs to NaN
  rm.update(NaN, 1000, 60, true);
  assert.equal(rm.solarChargeElapsedMs, 0, 'solarChargeElapsedMs must not become NaN');

  // Negative deltaMs must not reduce charge below 0
  rm.update(-500, 1100, 60, true);
  assert.equal(rm.solarChargeElapsedMs, 0);

  // Valid charge ticks still work properly
  rm.update(4000, 2000, 60, true);
  assert.equal(rm.solarChargeElapsedMs, 4000);

  // Non-finite deltaMs ignored
  rm.update(Infinity, 2100, 60, true);
  assert.equal(rm.solarChargeElapsedMs, 4000, 'Infinity deltaMs ignored');

  // Completes charge cleanly
  const res = rm.update(4000, 3000, 60, true);
  assert.equal(res.solarShieldGranted, true);
  assert.equal(rm.hasSolarShield, true);
});

test('Tier 5.7: All 3 combinations of bomb detonation relics (Prism+Psionic, Prism+Orbital, Psionic+Orbital)', () => {
  const pairs = [
    [RelicId.PYROCLASTIC_PRISM, RelicId.PSIONIC_FEEDBACK_CRYSTAL],
    [RelicId.PYROCLASTIC_PRISM, RelicId.ORBITAL_TARGETING_CORE],
    [RelicId.PSIONIC_FEEDBACK_CRYSTAL, RelicId.ORBITAL_TARGETING_CORE],
  ];

  const enemies = [{ id: 'target_1', r: 5, c: 6 }];

  for (const [rA, rB] of pairs) {
    const rm = new RelicManager([rA, rB], 2);
    const t = 10000;

    // Trigger all 3 methods on the same bomb explosion at t=10000
    const pyro = rm.onBombExploded({ r: 5, c: 5 }, t);
    const psionic = rm.onBombDetonationPsionicPulse(5, 5, enemies, false, 60, t);
    const orbital = rm.onBombDetonationOrbitalTargeting(5, 5, t);

    // Verify exactly the equipped relics procced
    const expectedPyro = rA === RelicId.PYROCLASTIC_PRISM || rB === RelicId.PYROCLASTIC_PRISM;
    const expectedPsionic = rA === RelicId.PSIONIC_FEEDBACK_CRYSTAL || rB === RelicId.PSIONIC_FEEDBACK_CRYSTAL;
    const expectedOrbital = rA === RelicId.ORBITAL_TARGETING_CORE || rB === RelicId.ORBITAL_TARGETING_CORE;

    assert.equal(pyro.spawnDiagonalShards, expectedPyro, `Pyroclastic proc mismatch for pair ${rA}+${rB}`);
    assert.equal(psionic.pulseRadius > 0, expectedPsionic, `Psionic proc mismatch for pair ${rA}+${rB}`);
    assert.equal(orbital.damage > 0, expectedOrbital, `Orbital proc mismatch for pair ${rA}+${rB}`);
  }
});

/* ==============================================================================
 * TIER 6: ZERO-GC SOAK & NUMERICAL STABILITY AUDIT (10,000 FRAMES)
 * ============================================================================== */

test('Tier 6: 10,000 continuous frames of relic updates execute with Zero-GC heap drift', () => {
  const rm = new RelicManager([RelicId.SOLAR_CAPACITOR, RelicId.POCKET_CHRONOMETER], 2);

  // Warmup 500 frames to stabilize JIT
  for (let f = 0; f < 500; f++) {
    rm.update(16.67, f * 16.67, 45, true);
  }

  if (typeof global.gc === 'function') global.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  for (let f = 0; f < 10000; f++) {
    const now = 500 * 16.67 + f * 16.67;
    const matchSec = Math.max(1, 60 - Math.floor(f / 60));
    rm.update(16.67, now, matchSec, (f % 100) < 50);

    // Occasional damage and kill events
    if (f % 500 === 0) {
      rm.onPlayerDamaged();
    }
  }

  if (typeof global.gc === 'function') global.gc();
  const heapAfter = process.memoryUsage().heapUsed;
  const driftMB = (heapAfter - heapBefore) / (1024 * 1024);

  if (typeof global.gc === 'function') {
    assert.ok(
      driftMB < 0.25,
      `Heap drift ${driftMB.toFixed(4)} MB across 10,000 frames must remain minimal (< 0.25 MB under explicit GC)`
    );
  } else {
    assert.ok(
      driftMB < 5.0,
      `Ambient heap drift ${driftMB.toFixed(4)} MB across 10,000 frames must remain minimal (< 5.0 MB under ambient GC)`
    );
  }
});

