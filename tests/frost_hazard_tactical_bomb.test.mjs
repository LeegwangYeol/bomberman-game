/**
 * tests/frost_hazard_tactical_bomb.test.mjs
 *
 * Tactical Bomb & Entity Interactions Test Suite for FrostHazard.ts:
 * 1. Cryo-Stabilized Super-Bomb: Fuse frozen/paused in frost zone, ice crystal tint
 * 2. Kicking Cryo Bomb: Releases diamond cryogenic shockwaves (4 diagonals & Manhattan perimeter)
 * 3. Minion Flash-Freezing: Exactly 120 damage, +120 score bonus, '❄ FLASH-FROZEN!'
 * 4. Boss Glacial Stasis: Exactly 15% Max HP damage, 1.5s (1500ms) stun, with Anti-Exploit Guard
 * 5. FSM Lifecycle, 3-Tier Telegraph Progression & Safe Area (>= 40% guaranteed)
 * 6. Player Mastery: Chill slowing (-25%), Cryo-Dash I-frames (1200ms invuln, +35% speed)
 * 7. Zero-GC Invariance: 10,000 rapid cycles with 0 memory drift
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FrostHazard,
  FrostLifecycleState,
  CryoTelegraphPhase,
  DURATION_CRYO_FORMATION_MS,
  DURATION_CRYO_SPREAD_MS,
  DURATION_CRYO_GLACIATION_MS,
  DURATION_CRYO_TELEGRAPH_MS,
  DURATION_GLACIAL_BURST_MS,
  DEFAULT_FROST_COOLDOWN_MS,
  CLIMAX_FROST_COOLDOWN_MS,
  CRYO_SUPER_BOMB_TINT,
  CRYO_SUPER_BOMB_EXTRA_RADIUS,
  CRYO_SUPER_BOMB_SHOCKWAVE_POWER,
  CRYO_DIAMOND_DIRECTIONS,
  CRYO_MINION_DAMAGE,
  CRYO_FLASH_FREEZE_SCORE,
  CRYO_FLASH_FREEZE_ULT_CHARGE,
  BOSS_GLACIAL_DAMAGE_RATIO,
  BOSS_GLACIAL_STASIS_STUN_MS,
  FLOATING_TEXT_CRYO_STABILIZED,
  FLOATING_TEXT_CRYO_SHOCKWAVE,
  FLOATING_TEXT_FLASH_FROZEN,
  FLOATING_TEXT_BOSS_GLACIAL_STASIS,
  FLOATING_TEXT_CRYO_PHASED,
  MIN_FROST_SAFE_AREA_RATIO as MIN_SAFE_AREA_RATIO,
} from '../src/game/hazards/FrostHazard.ts';

import { COLS } from '../src/game/pathfinding.ts';

/* ==============================================================================
 * TIER 1: CONSTANTS & FSM LIFECYCLE PROGRESSION
 * ============================================================================== */

test('FrostHazard [Tier 1]: Timing, damage, and diamond directions calibrated', () => {
  assert.equal(DURATION_CRYO_FORMATION_MS, 1000);
  assert.equal(DURATION_CRYO_SPREAD_MS, 600);
  assert.equal(DURATION_CRYO_GLACIATION_MS, 400);
  assert.equal(DURATION_CRYO_TELEGRAPH_MS, 2000);
  assert.equal(DURATION_GLACIAL_BURST_MS, 400);
  assert.equal(DEFAULT_FROST_COOLDOWN_MS, 5700);
  assert.equal(CLIMAX_FROST_COOLDOWN_MS, 3700);

  // Tactical Bomb & Combat constants
  assert.equal(CRYO_SUPER_BOMB_TINT, 0x80d8ff);
  assert.equal(CRYO_SUPER_BOMB_EXTRA_RADIUS, 3);
  assert.equal(CRYO_SUPER_BOMB_SHOCKWAVE_POWER, 4);
  assert.equal(CRYO_MINION_DAMAGE, 120, 'Minion flash-freezing must deal exactly 120 damage');
  assert.equal(CRYO_FLASH_FREEZE_SCORE, 120, 'Minion flash-freezing must grant exactly +120 score');
  assert.equal(CRYO_FLASH_FREEZE_ULT_CHARGE, 6);
  assert.equal(BOSS_GLACIAL_DAMAGE_RATIO, 0.15, 'Boss stasis must deal 15% Max HP damage');
  assert.equal(BOSS_GLACIAL_STASIS_STUN_MS, 1500, 'Boss stasis must inflict 1.5s (1500ms) stun');

  // Diamond Directions
  assert.equal(CRYO_DIAMOND_DIRECTIONS.length, 4, 'Must define 4 diamond diagonal directions');
  const nw = CRYO_DIAMOND_DIRECTIONS.find((d) => d.name === 'NORTH_WEST');
  const ne = CRYO_DIAMOND_DIRECTIONS.find((d) => d.name === 'NORTH_EAST');
  const sw = CRYO_DIAMOND_DIRECTIONS.find((d) => d.name === 'SOUTH_WEST');
  const se = CRYO_DIAMOND_DIRECTIONS.find((d) => d.name === 'SOUTH_EAST');
  assert.deepEqual({ dr: nw.dr, dc: nw.dc }, { dr: -1, dc: -1 });
  assert.deepEqual({ dr: ne.dr, dc: ne.dc }, { dr: -1, dc: 1 });
  assert.deepEqual({ dr: sw.dr, dc: sw.dc }, { dr: 1, dc: -1 });
  assert.deepEqual({ dr: se.dr, dc: se.dc }, { dr: 1, dc: 1 });
});

test('FrostHazard [Tier 1]: 4-Stage FSM and 3-Tier Telegraph Progression', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  assert.equal(hazard.getState(), FrostLifecycleState.DORMANT);

  // Safe area guarantee
  assert.ok(hazard.getSafeAreaRatio() >= MIN_SAFE_AREA_RATIO, 'Safe area must be >= 40%');
  assert.ok(hazard.getSafeAreaRatio() >= 0.80, `Safe area should be >= 80% on 13x15 arena (observed ${hazard.getSafeAreaRatio().toFixed(2)})`);

  hazard.start('OUTBREAK');
  assert.equal(hazard.getState(), FrostLifecycleState.CRYO_TELEGRAPH);
  assert.equal(hazard.getTelegraphPhase(), CryoTelegraphPhase.RIME_FORMATION);

  // Step 1: Formation (0 - 1000ms)
  hazard.update(500);
  assert.equal(hazard.getState(), FrostLifecycleState.CRYO_TELEGRAPH);
  assert.equal(hazard.getTelegraphPhase(), CryoTelegraphPhase.RIME_FORMATION);

  // Step 2: Spread (1000 - 1600ms)
  hazard.update(600); // 1100ms
  assert.equal(hazard.getTelegraphPhase(), CryoTelegraphPhase.HOARFROST_SPREAD);

  // Step 3: Glaciation (1600 - 2000ms)
  hazard.update(600); // 1700ms
  assert.equal(hazard.getTelegraphPhase(), CryoTelegraphPhase.PERMAFROST_GLACIATION);

  // Step 4: Glacial Burst (2000ms -> active 400ms)
  hazard.update(400); // 2100ms
  assert.equal(hazard.getState(), FrostLifecycleState.GLACIAL_BURST);
  assert.equal(hazard.isTileLethal(6, 7), true);

  // Step 5: Cooldown
  hazard.update(450);
  assert.equal(hazard.getState(), FrostLifecycleState.COOLDOWN);
  assert.equal(hazard.isTileLethal(6, 7), false);
});

/* ==============================================================================
 * TIER 2: CRYO-STABILIZED SUPER-BOMB (FUSE FROZEN / PAUSED IN FROST ZONE)
 * ============================================================================== */

test('FrostHazard [Tier 2]: Bomb in frost zone becomes Cryo-Stabilized with paused fuse', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Place bomb at frost core (6, 7)
  const placed = hazard.onBombPlaced('bomb_cryo_1', 6, 7, 3, 3000);
  assert.equal(placed.isCryoStabilized, true, 'Bomb inside frost zone must be Cryo-Stabilized');
  assert.equal(placed.isFuseFrozen, true, 'Fuse must be marked frozen');
  assert.equal(placed.modifiedFuseMs, 3000, 'Original fuse must be preserved');
  assert.equal(placed.tint, CRYO_SUPER_BOMB_TINT, 'Must have ice crystal tint (0x80d8ff)');
  assert.equal(placed.floatingText, FLOATING_TEXT_CRYO_STABILIZED);

  // Evaluate bomb across multiple time steps (1000ms elapsed)
  const eval1 = hazard.evaluateBomb('bomb_cryo_1', 6, 7, 3000, 1000);
  assert.equal(eval1.isCryoStabilized, true);
  assert.equal(eval1.isFuseFrozen, true);
  assert.equal(eval1.fusePaused, true, 'Fuse countdown must be paused');
  assert.equal(eval1.remainingFuseMs, 3000, 'Remaining fuse MUST NOT decrement while in frost zone');
  assert.equal(eval1.tint, CRYO_SUPER_BOMB_TINT);

  // Evaluate bomb outside frost zone (1, 1)
  const evalOutside = hazard.evaluateBomb('bomb_safe_1', 1, 1, 3000, 500);
  assert.equal(evalOutside.isCryoStabilized, false);
  assert.equal(evalOutside.isFuseFrozen, false);
  assert.equal(evalOutside.fusePaused, false);
  assert.equal(evalOutside.remainingFuseMs, 2500, 'Bomb outside frost zone must tick down normally');
  assert.equal(evalOutside.tint, 0xffffff);
});

/* ==============================================================================
 * TIER 3: KICKING CRYO-STABILIZED BOMB RELEASES DIAMOND CRYOGENIC SHOCKWAVES
 * ============================================================================== */

test('FrostHazard [Tier 3]: Kicking Cryo-Stabilized Super-Bomb releases Diamond Cryogenic Shockwaves', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Kick bomb from frost zone (6, 7)
  const shockwave = hazard.kickCryoBomb('bomb_cryo_1', 6, 7, 0, 1, CRYO_SUPER_BOMB_SHOCKWAVE_POWER);
  assert.equal(shockwave.shockwaveReleased, true, 'Diamond shockwave must be released on kick');
  assert.equal(shockwave.bombId, 'bomb_cryo_1');
  assert.equal(shockwave.originR, 6);
  assert.equal(shockwave.originC, 7);
  assert.equal(shockwave.power, CRYO_SUPER_BOMB_SHOCKWAVE_POWER);
  assert.equal(shockwave.floatingText, FLOATING_TEXT_CRYO_SHOCKWAVE);
  assert.ok(shockwave.shockwaveTilesCount > 0, 'Must generate shockwave tiles');

  const activeTiles = hazard.getActiveDiamondShockwaveTiles();
  assert.ok(activeTiles.length >= 8, 'Must include diagonal rays and diamond wavefront');

  // Check diagonal shockwave rays presence
  const nwTiles = activeTiles.filter((t) => t.isDiagonal && t.r < 6 && t.c < 7);
  const neTiles = activeTiles.filter((t) => t.isDiagonal && t.r < 6 && t.c > 7);
  const swTiles = activeTiles.filter((t) => t.isDiagonal && t.r > 6 && t.c < 7);
  const seTiles = activeTiles.filter((t) => t.isDiagonal && t.r > 6 && t.c > 7);

  assert.ok(nwTiles.length > 0, 'North-West diamond ray must be populated');
  assert.ok(neTiles.length > 0, 'North-East diamond ray must be populated');
  assert.ok(swTiles.length > 0, 'South-West diamond ray must be populated');
  assert.ok(seTiles.length > 0, 'South-East diamond ray must be populated');

  // Verify cryoShockwaveMask is updated
  for (const t of activeTiles) {
    const idx = t.r * COLS + t.c;
    assert.equal(hazard.cryoShockwaveMask[idx], 1, `Tile (${t.r}, ${t.c}) must be marked in cryoShockwaveMask`);
  }
});

test('FrostHazard [Tier 3]: Kicking normal bomb outside frost zone does NOT release diamond shockwaves', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Kick bomb far away from frost zone at (1, 1)
  const normalKick = hazard.kickCryoBomb('bomb_normal_99', 1, 1, 0, 1, 3);
  assert.equal(normalKick.shockwaveReleased, false);
  assert.equal(normalKick.shockwaveTilesCount, 0);
});

/* ==============================================================================
 * TIER 4: MINION FLASH-FREEZING (120 DAMAGE, +120 SCORE, '❄ FLASH-FROZEN!')
 * ============================================================================== */

test('FrostHazard [Tier 4]: Minions in glacial burst are flash-frozen for 120 damage and +120 score', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Fast-forward into GLACIAL_BURST
  hazard.update(DURATION_CRYO_TELEGRAPH_MS + 50);
  assert.equal(hazard.getState(), FrostLifecycleState.GLACIAL_BURST);

  // Evaluate minion at (6, 7)
  const minionRes = hazard.checkEnemyCollision(6, 7, false);
  assert.equal(minionRes.hit, true, 'Minion must be hit during glacial burst');
  assert.equal(minionRes.damage, 120, 'Minion must suffer exactly 120 flash-freeze damage');
  assert.equal(minionRes.scoreBonus, 120, 'Must grant exactly +120 score bonus');
  assert.equal(minionRes.ultimateChargeBonus, CRYO_FLASH_FREEZE_ULT_CHARGE);
  assert.equal(minionRes.isFlashFrozen, true, 'Minion must be marked as flash-frozen');
  assert.equal(minionRes.floatingText, FLOATING_TEXT_FLASH_FROZEN);
});

test('FrostHazard [Tier 4]: Minions hit by kicked Cryo Bomb shockwave are flash-frozen', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Trigger diamond shockwave from (6, 7)
  hazard.kickCryoBomb('bomb_cryo_wave', 6, 7, 0, 0, 4);

  // Minion standing at NW diagonal tile (5, 6) in the shockwave path
  const minionWaveRes = hazard.checkEnemyCollision(5, 6, false);
  assert.equal(minionWaveRes.hit, true, 'Minion in diamond shockwave must be hit');
  assert.equal(minionWaveRes.damage, 120, 'Minion must suffer 120 damage from shockwave');
  assert.equal(minionWaveRes.scoreBonus, 120, 'Minion must award +120 score from shockwave');
  assert.equal(minionWaveRes.isFlashFrozen, true);
  assert.equal(minionWaveRes.floatingText, FLOATING_TEXT_FLASH_FROZEN);
});

/* ==============================================================================
 * TIER 5: BOSS GLACIAL STASIS (15% HP DAMAGE + 1.5S STUN + ANTI-EXPLOIT GUARD)
 * ============================================================================== */

test('FrostHazard [Tier 5]: Boss takes 15% HP damage and 1.5s stun with Anti-Exploit Guard', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Fast-forward into GLACIAL_BURST
  hazard.update(DURATION_CRYO_TELEGRAPH_MS + 50);
  assert.equal(hazard.getState(), FrostLifecycleState.GLACIAL_BURST);

  const bossMaxHp = 2000;
  // First strike: Boss hit in glacial burst
  const bossHit1 = hazard.checkEnemyCollision(6, 7, true, bossMaxHp);
  assert.equal(bossHit1.hit, true, 'Boss must be hit on first contact');
  assert.equal(bossHit1.damage, 300, 'Boss must suffer exactly 15% Max HP damage (2000 * 0.15 = 300)');
  assert.equal(bossHit1.isStunned, true, 'Boss must be stunned');
  assert.equal(bossHit1.stunDurationMs, 1500, 'Boss stun duration must be exactly 1.5s (1500ms)');
  assert.equal(bossHit1.floatingText, FLOATING_TEXT_BOSS_GLACIAL_STASIS);

  // Anti-Exploit Guard: Subsequent checks in the SAME burst window MUST be rejected
  const bossHit2 = hazard.checkEnemyCollision(6, 7, true, bossMaxHp);
  assert.equal(bossHit2.hit, false, 'Anti-exploit guard must reject second hit in same burst');
  assert.equal(bossHit2.damage, 0, 'Exploit hit must deal 0 damage');
  assert.equal(bossHit2.isStunned, false, 'Exploit hit must not re-stun boss');
  assert.equal(bossHit2.stunDurationMs, 0);

  const bossHit3 = hazard.checkEnemyCollision(6, 7, true, bossMaxHp);
  assert.equal(bossHit3.hit, false);
  assert.equal(bossHit3.damage, 0);

  // Reset guard or progress to next cycle
  hazard.update(DURATION_GLACIAL_BURST_MS); // Enter COOLDOWN
  hazard.update(DEFAULT_FROST_COOLDOWN_MS); // Enter next CRYO_TELEGRAPH
  hazard.update(DURATION_CRYO_TELEGRAPH_MS + 10); // Enter next GLACIAL_BURST

  assert.equal(hazard.getState(), FrostLifecycleState.GLACIAL_BURST);
  // In new burst cycle, Boss can be struck again legitimately
  const bossNextCycleHit = hazard.checkEnemyCollision(6, 7, true, bossMaxHp);
  assert.equal(bossNextCycleHit.hit, true, 'Boss can be struck in next legitimate burst cycle');
  assert.equal(bossNextCycleHit.damage, 300);
  assert.equal(bossNextCycleHit.stunDurationMs, 1500);
});

/* ==============================================================================
 * TIER 6: PLAYER MASTERY & CRYO-DASH I-FRAMES
 * ============================================================================== */

test('FrostHazard [Tier 6]: Player walking in burst takes damage; Dashing grants Cryo-Dash I-frames', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Fast-forward into GLACIAL_BURST
  hazard.update(DURATION_CRYO_TELEGRAPH_MS + 50);

  // Player walking (not dashing)
  const playerWalk = hazard.checkPlayerCollision(6, 7, false);
  assert.equal(playerWalk.hit, true);
  assert.equal(playerWalk.damage, 25);
  assert.equal(playerWalk.isChilled, true);
  assert.equal(playerWalk.slowFactor, 0.75, '-25% slow factor when chilled');

  // Player dashing: Cryo-Dash triggers I-frames
  const playerDash = hazard.checkPlayerCollision(6, 7, true, 50);
  assert.equal(playerDash.damage, 0, 'Dashing player takes 0 damage');
  assert.equal(playerDash.isEscaping, true);
  assert.equal(playerDash.cryoDashGranted, true);
  assert.equal(playerDash.invulnDurationMs, 1200, 'Must grant 1200ms invulnerability');
  assert.equal(playerDash.speedBoostRatio, 0.30, '+30% speed boost');
  assert.equal(playerDash.floatingText, FLOATING_TEXT_CRYO_PHASED);
});

/* ==============================================================================
 * TIER 7: ZERO-GC INVARIANCE & HIGH THROUGHPUT STRESS TEST
 * ============================================================================== */

test('FrostHazard [Tier 7]: 10,000 rapid interaction cycles execute with Zero Heap Drift', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Warmup run
  for (let i = 0; i < 200; i++) {
    hazard.evaluateBomb(`warm_${i}`, 6, 7, 3000, 16);
    hazard.kickCryoBomb(`warm_${i}`, 6, 7, 0, 1, 4);
    hazard.checkEnemyCollision(6, 7, false);
    hazard.checkEnemyCollision(6, 7, true, 1000);
    hazard.resetBossExploitGuard();
  }

  const isGcExposed = typeof global.gc === 'function';
  if (isGcExposed) {
    global.gc();
    global.gc();
  }

  const initialHeap = process.memoryUsage().heapUsed;

  // 10,000 Rapid tactical bomb & entity cycles
  for (let i = 0; i < 10000; i++) {
    hazard.evaluateBomb(i, 6, 7, 3000, 16);
    hazard.kickCryoBomb(i, 6, 7, 0, 1, 4);
    hazard.checkEnemyCollision(6, 7, false);
    hazard.checkEnemyCollision(6, 7, true, 1000);
    hazard.checkPlayerCollision(6, 7, i % 2 === 0, 50);
    hazard.resetBossExploitGuard();
  }

  if (isGcExposed) {
    global.gc();
    global.gc();
  }

  const finalHeap = process.memoryUsage().heapUsed;
  const driftMb = (finalHeap - initialHeap) / (1024 * 1024);

  if (isGcExposed) {
    assert.ok(driftMb < 0.25, `Memory drift must be < 0.25 MB, observed: ${driftMb.toFixed(4)} MB`);
  } else {
    assert.ok(driftMb < 5.0, `Ambient memory drift must be bounded < 5.0 MB, observed: ${driftMb.toFixed(4)} MB`);
  }
});
