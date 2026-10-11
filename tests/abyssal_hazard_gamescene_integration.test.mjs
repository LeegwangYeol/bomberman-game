import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AbyssalHazard,
  AbyssalLifecycleState,
  AbyssalTelegraphPhase,
  AbyssalDangerValue,
  DURATION_TIDAL_SURGE_MS,
  DURATION_ABYSSAL_MAELSTROM_MS,
  DEFAULT_ABYSSAL_COOLDOWN_MS,
  ABYSSAL_GLIDE_INVULN_MS,
  ABYSSAL_GLIDE_SPEED_BURST_RATIO,
  FLOATING_TEXT_ABYSSAL_GLIDE,
  HYDROSTATIC_DRAG_DURATION_MS,
  HYDROSTATIC_DRAG_SLOW_RATIO,
  FLOATING_TEXT_HYDROSTATIC_DRAG,
  FLOATING_TEXT_ABYSSAL_UNDERTOW,
  PLAYER_MAELSTROM_DAMAGE,
  ABYSSAL_SUPER_BOMB_TINT,
  ABYSSAL_FUSE_ACCELERATION_MS,
  MAELSTROM_EXTRA_POWER,
  MAELSTROM_BONUS_SCORE,
  BOMB_KICK_ABYSSAL_SPEED,
  OCEANIC_CALM_DURATION_MS,
  ABYSSAL_MINION_DAMAGE,
  ENEMY_ABYSSAL_SCORE,
  ENEMY_ABYSSAL_ULTIMATE_CHARGE,
  BOSS_ABYSSAL_DAMAGE_RATIO,
  BOSS_ABYSSAL_STASIS_STUN_MS,
  BOSS_ABYSSAL_EXPLOIT_COOLDOWN_MS,
  FLOATING_TEXT_ABYSSAL_FUSED,
  FLOATING_TEXT_HYDRO_SLIPSTREAM,
  FLOATING_TEXT_ABYSSAL_SLIPSTREAM,
  FLOATING_TEXT_MAELSTROM_BURST,
  FLOATING_TEXT_MAELSTROM_DETONATION,
  FLOATING_TEXT_OCEANIC_CALM,
  FLOATING_TEXT_HYDRO_BARRIER_ANCHOR,
  FLOATING_TEXT_AQUA_GLIDE,
  FLOATING_TEXT_ABYSS_CRUSHED,
  FLOATING_TEXT_MAELSTROM_STASIS,
  AbyssalHazardAudio,
  HazardRenderer,
} from '../src/game/hazards/index.ts';
import { calculateClampedPlayerSpeed } from '../src/game/gameplay_mechanics.ts';
import { ROWS, COLS, TOTAL_TILES } from '../src/game/pathfinding.ts';

test('GameScene Integration 1: AbyssalHazard and AbyssalHazardAudio initialization and defaults', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);

  assert.equal(hazard.getState(), AbyssalLifecycleState.DORMANT);
  assert.equal(hazard.getTelegraphPhase(), AbyssalTelegraphPhase.NONE);
  assert.equal(hazard.getCenterRow(), 6);
  assert.equal(hazard.getCenterCol(), 7);
  assert.ok(hazard.getActiveAbyssalCount() === 0 || hazard.getActiveAbyssalCount() === 29);
  assert.equal(hazard.getSafeAreaRatio(), 1.0);

  const audio = AbyssalHazardAudio.getInstance();
  assert.ok(audio instanceof AbyssalHazardAudio);
});

test('GameScene Integration 2: Lifecycle updates and FSM state progression', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.triggerTidalSurge(6, 7);

  assert.equal(hazard.getState(), AbyssalLifecycleState.TIDAL_SURGE);
  assert.equal(hazard.getTelegraphPhase(), AbyssalTelegraphPhase.HIGH_TIDE_WARNING);
  assert.ok(hazard.getActiveAbyssalCount() > 0, 'Active abyssal tiles populated');
  assert.ok(hazard.getSafeAreaRatio() >= 0.80, 'Safe area >= 80% maintained');

  // Advance through telegraph phases
  hazard.update(1050);
  assert.equal(hazard.getTelegraphPhase(), AbyssalTelegraphPhase.WHIRLPOOL_VORTEX);

  hazard.update(600);
  assert.equal(hazard.getTelegraphPhase(), AbyssalTelegraphPhase.MAELSTROM_IMMINENT);

  // Transition to Maelstrom burst
  hazard.update(400);
  assert.equal(hazard.getState(), AbyssalLifecycleState.ABYSSAL_MAELSTROM);
  assert.equal(hazard.getTelegraphPhase(), AbyssalTelegraphPhase.NONE);

  // Transition to Oceanic Calm cooldown
  hazard.update(DURATION_ABYSSAL_MAELSTROM_MS + 10);
  assert.equal(hazard.getState(), AbyssalLifecycleState.OCEANIC_CALM);

  // Complete cooldown and cycle
  hazard.update(DEFAULT_ABYSSAL_COOLDOWN_MS + 10);
  assert.ok(hazard.getState() === AbyssalLifecycleState.TIDAL_SURGE || hazard.getState() === AbyssalLifecycleState.DORMANT);
});

test('GameScene Integration 3: Tactical Bomb Placement Hook (1.2s fuse acceleration, cyan tint)', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.triggerTidalSurge(6, 7);

  // Tile (6, 7) is epicenter of active water surge
  const bombRes = hazard.onBombPlaced('bomb-1', 6, 7, 2, 2000);
  assert.equal(bombRes.isAccelerated, true);
  assert.equal(bombRes.fuseAccelerationMs, ABYSSAL_FUSE_ACCELERATION_MS);
  assert.equal(bombRes.bombTint, ABYSSAL_SUPER_BOMB_TINT);
  assert.equal(bombRes.floatingText, FLOATING_TEXT_ABYSSAL_FUSED);

  // Bomb on outside safe tile is untouched
  const safeRes = hazard.onBombPlaced('bomb-safe', 0, 0, 2, 2000);
  assert.equal(safeRes.isAccelerated, false);
});

test('GameScene Integration 4: Tactical Bomb Detonation Hook (+2 blast power, +250 score)', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.triggerTidalSurge(6, 7);
  hazard.update(DURATION_TIDAL_SURGE_MS + 10); // Now in ABYSSAL_MAELSTROM

  assert.equal(hazard.getState(), AbyssalLifecycleState.ABYSSAL_MAELSTROM);

  const detRes = hazard.onBombDetonated('bomb-maelstrom', 6, 7, 2);
  assert.equal(detRes.isMaelstrom, true);
  assert.equal(detRes.extraPower, MAELSTROM_EXTRA_POWER);
  assert.equal(detRes.bonusScore, MAELSTROM_BONUS_SCORE);
  assert.ok(detRes.floatingText === FLOATING_TEXT_MAELSTROM_BURST || detRes.floatingText === FLOATING_TEXT_MAELSTROM_DETONATION);

  // Detonation outside maelstrom has no extra power
  const safeDet = hazard.onBombDetonated('bomb-outside', 0, 0, 2);
  assert.equal(safeDet.isMaelstrom, false);
});

test('GameScene Integration 5: Tactical Bomb Kick Hook (460 px/s slipstream acceleration)', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.triggerTidalSurge(6, 7);

  const kickRes = hazard.onBombKicked('bomb-kick', 6, 7, 300);
  assert.equal(kickRes.isSlipstreamKick, true);
  assert.equal(kickRes.kickSpeed, BOMB_KICK_ABYSSAL_SPEED);
  assert.ok(kickRes.floatingText === FLOATING_TEXT_HYDRO_SLIPSTREAM || kickRes.floatingText === FLOATING_TEXT_ABYSSAL_SLIPSTREAM);

  // Kicking outside surge retains normal speed
  const normalKick = hazard.onBombKicked('bomb-normal', 0, 0, 300);
  assert.equal(normalKick.isSlipstreamKick, false);
  assert.equal(normalKick.kickSpeed, 300);
});

test('GameScene Integration 6: Bomb Blast Impact Cleansing (4.0s safe sanctuary anchor)', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.triggerTidalSurge(6, 7);

  assert.equal(hazard.isTileInAbyssalZone(6, 7), true);

  const cleanseRes = hazard.onBombBlastImpact(6, 7);
  assert.equal(cleanseRes.cleanedTilesCount, 1);
  assert.equal(cleanseRes.durationMs, OCEANIC_CALM_DURATION_MS);
  assert.ok(cleanseRes.floatingText === FLOATING_TEXT_OCEANIC_CALM || cleanseRes.floatingText === FLOATING_TEXT_HYDRO_BARRIER_ANCHOR);
  assert.equal(hazard.isTileCleansed(6, 7), true);
  assert.equal(hazard.isTileInMaelstrom(6, 7), false);
});

test('GameScene Integration 7: Minion Crushing (120 environmental damage, +120 score, +6 ult)', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.triggerTidalSurge(6, 7);
  hazard.update(DURATION_TIDAL_SURGE_MS + 10); // Enter ABYSSAL_MAELSTROM

  const minionRes = hazard.checkEnemyCollision(6, 7, false, 1000);
  assert.equal(minionRes.hit, true);
  assert.equal(minionRes.damage, ABYSSAL_MINION_DAMAGE);
  assert.equal(minionRes.damage, 120);
  assert.equal(minionRes.isCrushed, true);
  assert.equal(minionRes.scoreBonus, ENEMY_ABYSSAL_SCORE);
  assert.equal(minionRes.ultimateChargeBonus, ENEMY_ABYSSAL_ULTIMATE_CHARGE);
  assert.equal(minionRes.floatingText, FLOATING_TEXT_ABYSS_CRUSHED);

  // Minion outside maelstrom unharmed
  const safeMinion = hazard.checkEnemyCollision(0, 0, false, 1000);
  assert.equal(safeMinion.hit, false);
});

test('GameScene Integration 8: Boss Maelstrom Stasis Stun (15% Max HP, 1.5s stun, anti-exploit guard)', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.triggerTidalSurge(6, 7);
  hazard.update(DURATION_TIDAL_SURGE_MS + 10); // Enter ABYSSAL_MAELSTROM

  const now = 2000;
  const bossRes = hazard.checkEnemyCollision(6, 7, true, now);
  assert.equal(bossRes.hit, true);
  assert.equal(bossRes.isStasisStunned, true);
  assert.equal(bossRes.isStunned, true);
  assert.equal(bossRes.stunDurationMs, BOSS_ABYSSAL_STASIS_STUN_MS);
  assert.equal(bossRes.stunDurationMs, 1500);
  assert.equal(bossRes.floatingText, FLOATING_TEXT_MAELSTROM_STASIS);

  // Anti-exploit guard rejects repeated hits within 2500ms cooldown window
  const immediateRepeat = hazard.checkEnemyCollision(6, 7, true, now + 500);
  assert.equal(immediateRepeat.hit, false);

  // Allowed after anti-exploit cooldown window expires
  const validRepeat = hazard.checkEnemyCollision(6, 7, true, now + BOSS_ABYSSAL_EXPLOIT_COOLDOWN_MS + 100);
  assert.equal(validRepeat.hit, true);
});

test('GameScene Integration 9: Player Combat Mastery (Aqua/Abyssal Glide vs Undertow/Drag)', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.triggerTidalSurge(6, 7);

  const px = 7 * 40 + 20; // 300px
  const py = 6 * 40 + 20; // 260px

  // Dashing across surge grants Abyssal Glide I-Frames & +40% speed boost
  const dashRes = hazard.evaluatePlayer(px, py, true, 1000);
  assert.equal(dashRes.abyssalGlideGranted || dashRes.isGlideActivated, true);
  assert.equal(dashRes.glideInvulnMs, ABYSSAL_GLIDE_INVULN_MS);
  assert.equal(dashRes.glideSpeedBoost, ABYSSAL_GLIDE_SPEED_BURST_RATIO);
  assert.ok(dashRes.floatingText === FLOATING_TEXT_ABYSSAL_GLIDE || dashRes.floatingText === FLOATING_TEXT_AQUA_GLIDE);

  // Walking across surge inflicts 30% slow debuff
  const walkRes = hazard.evaluatePlayer(px, py, false, 3000);
  assert.equal(walkRes.dazeInflicted || walkRes.undertowInflicted, true);
  assert.equal(walkRes.slowFactor, 1.0 - HYDROSTATIC_DRAG_SLOW_RATIO);
  assert.equal(walkRes.slowDurationMs, HYDROSTATIC_DRAG_DURATION_MS);
  assert.ok(walkRes.floatingText === FLOATING_TEXT_HYDROSTATIC_DRAG || walkRes.floatingText === FLOATING_TEXT_ABYSSAL_UNDERTOW);

  // Speed clamping integration
  const baseSpeed = 150;
  const clampedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: walkRes.slowFactor,
  });
  assert.ok(clampedSpeed >= 40, 'Speed respects minimum floor');
  assert.equal(clampedSpeed, Math.round(baseSpeed * 0.70));
});

test('GameScene Integration 10: HazardRendererContext binding and single-pass rendering', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.triggerTidalSurge(6, 7);

  const context = {
    abyssalHazard: hazard,
  };

  let cleared = false;
  const mockGraphics = {
    clear: () => { cleared = true; },
    fillStyle: () => {},
    fillRect: () => {},
    lineStyle: () => {},
    strokeRect: () => {},
    strokeCircle: () => {},
  };

  HazardRenderer.render(mockGraphics, context, 1000);
  assert.equal(cleared, true, 'Graphics cleared and rendered with abyssalHazard');
});

test('GameScene Integration 11: Shutdown and Teardown Lifecycle Cleanup', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.triggerTidalSurge(6, 7);

  assert.equal(hazard.getState(), AbyssalLifecycleState.TIDAL_SURGE);

  hazard.stop();
  assert.equal(hazard.getState(), AbyssalLifecycleState.DORMANT);
  assert.equal(hazard.getActiveAbyssalCount(), 0);

  hazard.destroy();
  assert.equal(hazard.getState(), AbyssalLifecycleState.DORMANT);
  assert.equal(hazard.getActiveAbyssalCount(), 0);

  const audio = AbyssalHazardAudio.getInstance();
  audio.stop();
  audio.destroy();
});
