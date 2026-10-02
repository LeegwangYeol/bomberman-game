/**
 * tests/frost_hazard_gamescene_integration.test.mjs
 *
 * End-to-End Integration Test Suite for FrostHazard & GameScene Subsystem
 * 2026-10-03 Daily Evolution Cycle — Expansion Test Suite
 *
 * Verification Architecture (10 Tiers):
 * - Tier 1: Headless GameScene Mock Harness & Subsystem Verification
 * - Tier 2: FrostHazard Initialization & Deterministic FSM Lifecycle in Scene Updates
 * - Tier 3: Procedural Graphics Rendering & Teardown Cleanliness
 * - Tier 4: Player Combat Mastery — Thermal Break Dash vs. Frost Chill Debuff
 * - Tier 5: Tactical Bomb Placement — Glacial Fuse Extension (+1.5s) & Ice Tint
 * - Tier 6: Bomb Kick Velocity Amplification on Glaciated Low-Friction Ice
 * - Tier 7: Bomb Blast Thermal Shock Shatter & Localized Thaw Cleansing
 * - Tier 8: Environmental Enemy Flash-Freeze & Boss Deep Freeze Stasis with Anti-Exploit Guard
 * - Tier 9: Mathematical Safe Area Invariants (>= 40% guaranteed, >= 80% observed)
 * - Tier 10: 1,000-Frame Rapid Continuous Simulation Stress Soak
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  FrostHazard,
  FrostLifecycleState,
  HoarfrostPhase,
  MIN_FROST_SAFE_AREA_RATIO,
  PLAYER_FROST_BURST_DAMAGE,
  CRYO_FLASH_FREEZE_SCORE,
  CRYO_FLASH_FREEZE_ULT_CHARGE,
  BOSS_FROST_DAMAGE_RATIO,
  BOSS_DEEP_FREEZE_STUN_MS,
  THERMAL_BREAK_INVULN_MS,
  THERMAL_BREAK_SPEED_BURST_RATIO,
  FROST_CHILL_DURATION_MS,
  FROST_CHILL_SLOW_RATIO,
  FROST_FUSE_EXTENSION_MS,
  THERMAL_SHOCK_EXTRA_POWER,
  THERMAL_SHOCK_BONUS_SCORE,
  BOMB_KICK_FROST_SPEED,
  FLOATING_TEXT_THERMAL_BREAK,
  FLOATING_TEXT_FROST_CHILL,
} from '../src/game/hazards/FrostHazard.ts';

import {
  FrostHazardAudio,
} from '../src/game/hazards/FrostHazardAudio.ts';

import {
  ROWS,
  COLS,
  TILE_SIZE,
} from '../src/game/pathfinding.ts';

import {
  CrisisManager,
  CrisisType,
} from '../src/game/crises/index.ts';

/* ==============================================================================
 * PROCEDURAL GRAPHICS MOCK (Headless Canvas Context)
 * ============================================================================== */

class MockGraphics {
  constructor() {
    this.drawCalls = [];
    this.isCleared = true;
    this.currentLineStyle = null;
    this.currentFillStyle = null;
  }

  clear() {
    this.drawCalls.length = 0;
    this.isCleared = true;
    this.currentLineStyle = null;
    this.currentFillStyle = null;
  }

  lineStyle(width, color, alpha = 1.0) {
    this.isCleared = false;
    this.currentLineStyle = { width, color, alpha };
    this.drawCalls.push({ type: 'lineStyle', width, color, alpha });
  }

  fillStyle(color, alpha = 1.0) {
    this.isCleared = false;
    this.currentFillStyle = { color, alpha };
    this.drawCalls.push({ type: 'fillStyle', color, alpha });
  }

  fillRect(x, y, width, height) {
    this.isCleared = false;
    this.drawCalls.push({
      type: 'fillRect',
      x,
      y,
      width,
      height,
      fill: { ...this.currentFillStyle },
    });
  }

  strokeRect(x, y, width, height) {
    this.isCleared = false;
    this.drawCalls.push({
      type: 'strokeRect',
      x,
      y,
      width,
      height,
      stroke: { ...this.currentLineStyle },
    });
  }

  fillCircle(x, y, radius) {
    this.isCleared = false;
    this.drawCalls.push({
      type: 'fillCircle',
      x,
      y,
      radius,
      fill: { ...this.currentFillStyle },
    });
  }

  strokeCircle(x, y, radius) {
    this.isCleared = false;
    this.drawCalls.push({
      type: 'strokeCircle',
      x,
      y,
      radius,
      stroke: { ...this.currentLineStyle },
    });
  }
}

/* ==============================================================================
 * HEADLESS AUDIO RECORDER
 * ============================================================================== */

class MockAudioVoicePool {
  constructor() {
    this.playedTones = [];
    this.capacity = 16;
  }
  init() {}
  playTone(params) {
    this.playedTones.push(params);
    return { osc: {}, filter: {}, gain: {} };
  }
  getActiveCount() {
    return this.playedTones.length;
  }
  reset() {
    this.playedTones.length = 0;
  }
  destroy() {
    this.playedTones.length = 0;
  }
}

/* ==============================================================================
 * HEADLESS GAMESCENE SIMULATOR FOR FROST HAZARD INTEGRATION
 * ============================================================================== */

class HeadlessGameScene {
  constructor() {
    this.emitter = new EventEmitter();
    this.game = {
      events: {
        emit: (event, ...args) => this.emitter.emit(event, ...args),
        on: (event, fn) => this.emitter.on(event, fn),
        off: (event, fn) => this.emitter.off(event, fn),
      },
    };

    // Graphics Subsystems
    this.hazardGraphics = new MockGraphics();

    // Hazard & Audio Subsystems
    this.frostHazard = new FrostHazard();
    this.audioPool = new MockAudioVoicePool();
    this.frostHazardAudio = new FrostHazardAudio(this.audioPool);
    this.crisisManager = new CrisisManager();

    // Map & Arena (13 rows x 15 cols standard Bomberman grid)
    this.map = this.createDefaultMap();
    this.frostHazard.init(6, 7);

    // Time & Scheduling
    this.time = {
      now: 0,
      delayedCalls: [],
      delayedCall: (delay, callback) => {
        const entry = { triggerAt: this.time.now + delay, callback, cancelled: false };
        this.time.delayedCalls.push(entry);
        return entry;
      },
    };

    // Camera Feedback Simulator
    this.cameraFlashes = [];
    this.cameras = {
      main: {
        flash: (duration, r, g, b) => {
          this.cameraFlashes.push({ duration, r, g, b, timestamp: this.time.now });
        },
      },
    };

    // Floating Combat Texts & Sound Log
    this.floatingTexts = [];
    this.soundEvents = [];

    // Player Entity
    this.playerSpeed = 160;
    this.player = {
      x: 7 * TILE_SIZE + TILE_SIZE / 2,
      y: 6 * TILE_SIZE + TILE_SIZE / 2,
      active: true,
      hp: 100,
      maxHp: 100,
      speed: 160,
      baseSpeed: 160,
      isDashing: false,
      dashElapsedMs: 0,
      tint: 0xffffff,
      alpha: 1.0,
      setTint: (val) => { this.player.tint = val; },
      clearTint: () => { this.player.tint = 0xffffff; },
      setAlpha: (val) => { this.player.alpha = val; },
    };

    this.isDashing = false;
    this.isInvulnerable = false;
    this.shieldInvulnerableUntil = 0;
    this.isAegisOverdriveActive = false;
    this.isGameOver = false;
    this.lastFrostChillFloatingTextMs = -Infinity;
    this.activeBuffs = [];

    // Entities
    this.bombs = [];
    this.enemies = [];
    this.activeBoss = null;
    this.score = 0;
    this.ultimateCharge = 0;

    // Mode-change listener
    this.onModeChanged = (mode) => {
      const normalized = (mode || '').toLowerCase();
      if (normalized === 'crisis_survival') {
        this.startCrisisMode('OUTBREAK');
      } else {
        this.stopCrisisMode();
      }
    };
    this.game.events.on('mode-changed', this.onModeChanged);
  }

  createDefaultMap() {
    const grid = [];
    for (let r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
          grid[r][c] = 1; // Perimeter Wall
        } else if (r % 2 === 0 && c % 2 === 0) {
          grid[r][c] = 1; // Indestructible Pillar
        } else {
          grid[r][c] = 0; // Walkable corridor
        }
      }
    }
    return grid;
  }

  startCrisisMode(stage = 'OUTBREAK') {
    this.frostHazard.start(stage);
    this.crisisManager.triggerCrisis(CrisisType.DIMENSIONAL_RIFTS);
  }

  stopCrisisMode() {
    this.frostHazard.stop();
    this.crisisManager.stopCrisis('reset');
    if (this.hazardGraphics) {
      this.hazardGraphics.clear();
    }
  }

  shutdown() {
    this.game.events.off('mode-changed', this.onModeChanged);
    this.stopCrisisMode();
    this.bombs.length = 0;
    this.enemies.length = 0;
    this.activeBoss = null;
    this.floatingTexts.length = 0;
    this.soundEvents.length = 0;
    this.time.delayedCalls.length = 0;
    this.activeBuffs.length = 0;
    if (this.hazardGraphics) {
      this.hazardGraphics.clear();
    }
  }

  spawnEnemy(id, r, c, isBoss = false, hp = 100) {
    const enemy = {
      id,
      r,
      c,
      x: c * TILE_SIZE + TILE_SIZE / 2,
      y: r * TILE_SIZE + TILE_SIZE / 2,
      active: true,
      isDead: false,
      isBoss,
      hp,
      maxHp: hp,
      isStunned: false,
      stunUntil: 0,
      takeDamage: (amount) => {
        enemy.hp = Math.max(0, enemy.hp - amount);
        if (enemy.hp <= 0) enemy.isDead = true;
      },
      takeBombDamage: (amount) => {
        enemy.hp = Math.max(0, enemy.hp - amount);
        if (enemy.hp <= 0) enemy.isDead = true;
      },
    };
    this.enemies.push(enemy);
    if (isBoss) {
      this.activeBoss = enemy;
    }
    return enemy;
  }

  spawnFloatingText(x, y, text, color) {
    this.floatingTexts.push({ x, y, text, color, timestamp: this.time.now });
  }

  addUltimateCharge(amount) {
    this.ultimateCharge = Math.min(100, this.ultimateCharge + amount);
  }

  grantThermalBreak() {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time.now;
    this.isInvulnerable = true;
    this.player.setAlpha(0.6);

    const originalSpeed = this.playerSpeed;
    this.playerSpeed = Math.floor(originalSpeed * (1.0 + THERMAL_BREAK_SPEED_BURST_RATIO));

    const existing = this.activeBuffs.find((b) => b.id === 'THERMAL_BREAK');
    if (existing) {
      existing.remainingMs = THERMAL_BREAK_INVULN_MS;
      existing.totalMs = THERMAL_BREAK_INVULN_MS;
    } else {
      this.activeBuffs.push({
        id: 'THERMAL_BREAK',
        name: 'Thermal Break',
        icon: '✦',
        color: '#38bdf8',
        remainingMs: THERMAL_BREAK_INVULN_MS,
        totalMs: THERMAL_BREAK_INVULN_MS,
      });
    }

    this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_THERMAL_BREAK, '#38bdf8');
    if (this.cameras?.main) {
      this.cameras.main.flash(100, 56, 189, 248);
    }
    if (this.frostHazardAudio) {
      this.frostHazardAudio.playThermalBreak(now);
    }

    this.time.delayedCall(THERMAL_BREAK_INVULN_MS, () => {
      if (this.player && this.player.active) {
        this.player.setAlpha(1.0);
        this.player.clearTint();
        if (this.time.now >= this.shieldInvulnerableUntil && !this.isAegisOverdriveActive) {
          this.isInvulnerable = false;
        }
      }
      this.playerSpeed = originalSpeed;
    });
  }

  applyFrostChill() {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time.now;
    if (this.isInvulnerable || this.isDashing) return;

    const existing = this.activeBuffs.find((b) => b.id === 'FROST_CHILL');
    if (existing) {
      existing.remainingMs = FROST_CHILL_DURATION_MS;
      existing.totalMs = FROST_CHILL_DURATION_MS;
    } else {
      this.activeBuffs.push({
        id: 'FROST_CHILL',
        name: 'Frost Chill',
        icon: '❄️',
        color: '#93c5fd',
        remainingMs: FROST_CHILL_DURATION_MS,
        totalMs: FROST_CHILL_DURATION_MS,
      });
    }

    if (now - this.lastFrostChillFloatingTextMs >= 2000) {
      this.lastFrostChillFloatingTextMs = now;
      this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_FROST_CHILL, '#93c5fd');
      if (this.frostHazardAudio) {
        this.frostHazardAudio.playFrostChill(now);
      }
    }

    if (this.player && this.player.active && !this.isInvulnerable) {
      this.player.setTint(0x93c5fd);
      this.time.delayedCall(FROST_CHILL_DURATION_MS, () => {
        if (this.player && this.player.active && !this.activeBuffs.some((b) => b.id === 'FROST_CHILL')) {
          this.player.clearTint();
        }
      });
    }
  }

  dropBomb(r, c, power = 2, baseFuseMs = 3000) {
    const bombId = Date.now() + Math.floor(Math.random() * 1000);
    let fuseDuration = baseFuseMs;
    let bombTint = 0xffffff;

    // Check interaction with FrostHazard
    if (this.frostHazard && this.frostHazard.state !== FrostLifecycleState.DORMANT && this.frostHazard.state !== FrostLifecycleState.THAW_COOLDOWN) {
      const frostInteraction = this.frostHazard.onBombPlaced(bombId, r, c, fuseDuration);
      if (frostInteraction.isFrozen) {
        fuseDuration = frostInteraction.modifiedFuseMs;
        bombTint = 0x93c5fd;
        this.spawnFloatingText(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2 - 25, '❄️ GLACIAL FUSE (+1.5s)', '#93c5fd');
      }
    }

    const bomb = {
      id: bombId,
      r,
      c,
      x: c * TILE_SIZE + TILE_SIZE / 2,
      y: r * TILE_SIZE + TILE_SIZE / 2,
      power,
      fuseMs: fuseDuration,
      tint: bombTint,
      isSliding: false,
      slideSpeed: 0,
      slideDir: { x: 0, y: 0 },
      setData: (key, val) => { bomb[key] = val; },
      getData: (key) => bomb[key],
      setTint: (val) => { bomb.tint = val; },
      setVelocity: (vx, vy) => {
        bomb.vx = vx;
        bomb.vy = vy;
      },
    };
    this.bombs.push(bomb);
    return bomb;
  }

  kickBomb(bomb, dirX, dirY) {
    bomb.isSliding = true;
    bomb.slideDir = { x: dirX, y: dirY };

    // Calculate dynamic kick speed based on surface friction
    let kickSpeed = 240; // Default bomb kick speed
    if (this.frostHazard && this.frostHazard.state !== FrostLifecycleState.DORMANT && this.frostHazard.state !== FrostLifecycleState.THAW_COOLDOWN) {
      const friction = this.frostHazard.evaluateFriction(bomb.x, bomb.y).friction;
      if (friction < 0.5) {
        kickSpeed = BOMB_KICK_FROST_SPEED; // 450 px/s
      }
    }

    bomb.slideSpeed = kickSpeed;
    bomb.setVelocity(dirX * kickSpeed, dirY * kickSpeed);
  }

  explodeBomb(bomb) {
    let effectivePower = bomb.power;
    let isPiercing = false;

    // Detonate in FrostHazard
    if (this.frostHazard && this.frostHazard.state !== FrostLifecycleState.DORMANT && this.frostHazard.state !== FrostLifecycleState.THAW_COOLDOWN) {
      const fDet = this.frostHazard.onBombDetonated(bomb.id, bomb.r, bomb.c, effectivePower);
      if (fDet.isThermalShock) {
        effectivePower = fDet.modifiedPower;
        isPiercing = isPiercing || fDet.piercing;
        const cX = bomb.c * TILE_SIZE + TILE_SIZE / 2;
        const cY = bomb.r * TILE_SIZE + TILE_SIZE / 2;
        this.score += (fDet.bonusScore ?? fDet.scoreBonus ?? 0);
        this.spawnFloatingText(cX, cY - 25, '❄️ THERMAL SHOCK (+200)', '#38bdf8');
      }

      // Localized thaw cleanse
      this.frostHazard.onBombBlastImpact(bomb.r, bomb.c);
    }

    // Remove bomb
    const idx = this.bombs.indexOf(bomb);
    if (idx !== -1) {
      this.bombs.splice(idx, 1);
    }

    return { effectivePower, isPiercing };
  }

  renderDynamicHazardGraphics(_time) {
    if (!this.hazardGraphics) return;
    this.hazardGraphics.clear();

    const fState = this.frostHazard?.getState();
    const hasFrost = this.frostHazard && fState !== FrostLifecycleState.DORMANT && fState !== FrostLifecycleState.THAW_COOLDOWN;
    if (!hasFrost) return;

    const frostIndices = this.frostHazard.getActiveFrostIndices();
    const frostCount = this.frostHazard.getActiveFrostCount();
    const isBurst = fState === FrostLifecycleState.ABSOLUTE_ZERO_BURST;
    const phase = this.frostHazard.getHoarfrostPhase();

    for (let i = 0; i < frostCount; i++) {
      const idx = frostIndices[i];
      const r = Math.floor(idx / COLS);
      const c = idx % COLS;
      const left = c * TILE_SIZE;
      const top = r * TILE_SIZE;

      if (isBurst) {
        this.hazardGraphics.fillStyle(0xffffff, 0.85);
        this.hazardGraphics.fillRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        this.hazardGraphics.lineStyle(2, 0x38bdf8, 0.9);
        this.hazardGraphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      } else {
        const alpha =
          phase === HoarfrostPhase.CRYSTALLIZATION
            ? 0.15
            : phase === HoarfrostPhase.PERMAFROST_CREEP
            ? 0.30
            : 0.45;
        this.hazardGraphics.fillStyle(0x38bdf8, alpha);
        this.hazardGraphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        this.hazardGraphics.lineStyle(1.5, 0x93c5fd, 0.5);
        this.hazardGraphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }
    }
  }

  update(time, delta) {
    this.time.now = time;

    // 1. Process delayed calls
    for (const call of this.time.delayedCalls) {
      if (!call.cancelled && this.time.now >= call.triggerAt) {
        call.callback();
        call.cancelled = true;
      }
    }

    // 2. Update Frost Hazard System
    if (this.frostHazard && this.frostHazard.state !== FrostLifecycleState.DORMANT) {
      this.frostHazard.update(delta);

      if (this.frostHazard.state === FrostLifecycleState.ABSOLUTE_ZERO_BURST && !this.isGameOver) {
        for (let i = 0; i < this.enemies.length; i++) {
          const enemy = this.enemies[i];
          if (enemy && enemy.active && !enemy.isDead) {
            const er = Math.floor(enemy.y / TILE_SIZE);
            const ec = Math.floor(enemy.x / TILE_SIZE);
            const isBoss = enemy.isBoss;
            const enemyHit = this.frostHazard.checkEnemyCollision(er, ec, isBoss);
            if (enemyHit.hit) {
              if (enemyHit.isShattered) {
                enemy.takeDamage(enemyHit.damage);
                this.score += enemyHit.scoreBonus;
                this.addUltimateCharge(enemyHit.ultimateChargeBonus);
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#38bdf8');
              } else if (enemyHit.isFrozenStunned && isBoss && this.activeBoss) {
                this.activeBoss.takeBombDamage(Math.floor(this.activeBoss.maxHp * BOSS_FROST_DAMAGE_RATIO));
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#38bdf8');
                this.activeBoss.isStunned = true;
                this.activeBoss.stunUntil = this.time.now + enemyHit.stunDurationMs;
              }
            }
          }
        }
      }

      this.renderDynamicHazardGraphics(time);
    }

    // 3. Update Bomb Fuses
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      if (!b) continue;
      b.fuseMs -= delta;
      if (b.fuseMs <= 0) {
        this.explodeBomb(b);
      }
    }

    // 4. Update Player Movement & Frost Interaction
    let frostMultiplier = 1.0;
    if (this.frostHazard && this.frostHazard.state !== FrostLifecycleState.DORMANT && this.frostHazard.state !== FrostLifecycleState.THAW_COOLDOWN) {
      const fRes = this.frostHazard.evaluatePlayer(this.player.x, this.player.y, this.isDashing, this.time.now);
      if (fRes.thermalBreakGranted) {
        this.grantThermalBreak();
      } else if (fRes.frostChillInflicted && !this.isDashing && !this.isInvulnerable) {
        this.applyFrostChill();
      }
      if (fRes.hit && this.frostHazard.state === FrostLifecycleState.ABSOLUTE_ZERO_BURST && !this.isDashing && !this.isInvulnerable) {
        this.player.hp = Math.max(0, this.player.hp - PLAYER_FROST_BURST_DAMAGE);
      }
      frostMultiplier = fRes.slowFactor;
    }

    const isThermalBreakActive = this.activeBuffs.some((b) => b.id === 'THERMAL_BREAK');
    const isFrostChillActive = this.activeBuffs.some((b) => b.id === 'FROST_CHILL');

    if (isThermalBreakActive) {
      frostMultiplier *= (1.0 + THERMAL_BREAK_SPEED_BURST_RATIO);
    }
    if (isFrostChillActive) {
      frostMultiplier *= (1.0 - FROST_CHILL_SLOW_RATIO);
    }

    this.player.speed = this.playerSpeed * frostMultiplier;
  }
}

/* ==============================================================================
 * TIER 1: HEADLESS GAMESCENE MOCK HARNESS & SUBSYSTEM VERIFICATION
 * ============================================================================== */

test('Tier 1.1 [Harness Setup]: HeadlessGameScene initializes FrostHazard, map, and graphics without errors', () => {
  const scene = new HeadlessGameScene();
  assert.ok(scene.frostHazard instanceof FrostHazard);
  assert.ok(scene.hazardGraphics instanceof MockGraphics);
  assert.equal(scene.frostHazard.state, FrostLifecycleState.DORMANT);
  assert.equal(scene.map.length, ROWS);
  assert.equal(scene.map[0].length, COLS);
  assert.equal(scene.player.hp, 100);
});

/* ==============================================================================
 * TIER 2: FROSTHAZARD INITIALIZATION & DETERMINISTIC FSM LIFECYCLE
 * ============================================================================== */

test('Tier 2.1 [Lifecycle Progression]: Scene updates transition FrostHazard through 4 stages and telegraph phases', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  assert.equal(scene.frostHazard.state, FrostLifecycleState.HOARFROST_SURGE);
  assert.equal(scene.frostHazard.getHoarfrostPhase(), HoarfrostPhase.CRYSTALLIZATION);

  // Advance 1000ms -> PERMAFROST_CREEP
  scene.update(1000, 1000);
  assert.equal(scene.frostHazard.state, FrostLifecycleState.HOARFROST_SURGE);
  assert.equal(scene.frostHazard.getHoarfrostPhase(), HoarfrostPhase.PERMAFROST_CREEP);

  // Advance 600ms -> SUBLIMATION_FLASH
  scene.update(1600, 600);
  assert.equal(scene.frostHazard.state, FrostLifecycleState.HOARFROST_SURGE);
  assert.equal(scene.frostHazard.getHoarfrostPhase(), HoarfrostPhase.SUBLIMATION_FLASH);

  // Advance 400ms -> ABSOLUTE_ZERO_BURST
  scene.update(2000, 400);
  assert.equal(scene.frostHazard.state, FrostLifecycleState.ABSOLUTE_ZERO_BURST);

  // Advance 350ms -> THAW_COOLDOWN
  scene.update(2350, 350);
  assert.equal(scene.frostHazard.state, FrostLifecycleState.THAW_COOLDOWN);

  // Advance 5700ms -> loops back to HOARFROST_SURGE
  scene.update(8050, 5700);
  assert.equal(scene.frostHazard.state, FrostLifecycleState.HOARFROST_SURGE);
});

/* ==============================================================================
 * TIER 3: PROCEDURAL GRAPHICS RENDERING & TEARDOWN CLEANLINESS
 * ============================================================================== */

test('Tier 3.1 [Graphics Pipeline]: Glaciated tiles are rendered and cleared cleanly upon shutdown', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Advance to crystallization
  scene.update(500, 500);
  assert.ok(scene.hazardGraphics.drawCalls.length > 0, 'Graphics draw calls generated for crystallization');
  assert.equal(scene.hazardGraphics.isCleared, false);

  // Advance to burst
  scene.update(2050, 1550);
  assert.ok(scene.hazardGraphics.drawCalls.some((c) => c.fill?.color === 0xffffff), 'Blinding white burst rendered');

  // Shutdown clears graphics completely
  scene.shutdown();
  assert.equal(scene.hazardGraphics.isCleared, true);
  assert.equal(scene.hazardGraphics.drawCalls.length, 0);
});

/* ==============================================================================
 * TIER 4: PLAYER COMBAT MASTERY — THERMAL BREAK DASH VS. FROST CHILL DEBUFF
 * ============================================================================== */

test('Tier 4.1 [Player Dash Thermal Break]: Dashing through frost triggers Thermal Break invulnerability and speed boost', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Advance up to telegraph end (1990ms), before burst
  scene.update(1990, 1990);

  // Player position at frost epicenter, starting dash
  scene.player.x = 7 * TILE_SIZE + TILE_SIZE / 2;
  scene.player.y = 6 * TILE_SIZE + TILE_SIZE / 2;
  scene.isDashing = true;

  // Advance into ABSOLUTE_ZERO_BURST at stateTimerMs = 60ms (<= 150ms cryo-tunneling window)
  scene.update(2050, 60);

  assert.equal(scene.isInvulnerable, true, 'Thermal break grants invulnerability');
  assert.ok(scene.activeBuffs.some((b) => b.id === 'THERMAL_BREAK'), 'Thermal break buff registered');
  assert.ok(scene.floatingTexts.some((t) => t.text === FLOATING_TEXT_THERMAL_BREAK), 'Floating text displayed');
  assert.ok(scene.cameraFlashes.length > 0, 'Camera flashed with cyan glow');
  assert.equal(scene.player.hp, 100, 'Dashing player takes 0 damage in burst');
});

test('Tier 4.2 [Walking Hypothermic Chill & Burst Damage]: Non-dashing player takes frost chill slow and burst damage', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Position player in frost zone during Hoarfrost Surge
  scene.player.x = 7 * TILE_SIZE + TILE_SIZE / 2;
  scene.player.y = 6 * TILE_SIZE + TILE_SIZE / 2;
  scene.isDashing = false;

  scene.update(500, 500);

  assert.ok(scene.activeBuffs.some((b) => b.id === 'FROST_CHILL'), 'Frost chill buff applied');
  assert.ok(scene.floatingTexts.some((t) => t.text === FLOATING_TEXT_FROST_CHILL), 'Floating text displayed');
  assert.equal(scene.player.tint, 0x93c5fd, 'Player tinted ice blue');
  assert.ok(scene.player.speed < scene.player.baseSpeed, 'Player speed reduced by frost chill');

  // Advance into Absolute Zero Burst without dashing
  scene.update(2100, 1600);
  assert.equal(scene.player.hp, 75, 'Player took 25 absolute zero burst damage');
});

/* ==============================================================================
 * TIER 5: TACTICAL BOMB PLACEMENT — GLACIAL FUSE EXTENSION (+1.5s) & ICE TINT
 * ============================================================================== */

test('Tier 5.1 [Glacial Bomb Encapsulation]: Bombs placed in frost zone receive +1500ms fuse and 0x93c5fd tint', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');
  scene.update(500, 500);

  // 1. Drop bomb inside frost zone (row 6, col 7)
  const frostBomb = scene.dropBomb(6, 7, 2, 3000);
  assert.equal(frostBomb.fuseMs, 3000 + FROST_FUSE_EXTENSION_MS, 'Fuse extended by exactly 1500ms');
  assert.equal(frostBomb.tint, 0x93c5fd, 'Bomb tinted glacial ice blue');
  assert.ok(scene.floatingTexts.some((t) => t.text.includes('GLACIAL FUSE')), 'Floating combat text spawned');

  // 2. Drop bomb outside frost zone (row 1, col 1)
  const normalBomb = scene.dropBomb(1, 1, 2, 3000);
  assert.equal(normalBomb.fuseMs, 3000, 'Normal bomb retains standard 3000ms fuse');
  assert.equal(normalBomb.tint, 0xffffff, 'Normal bomb has default tint');
});

/* ==============================================================================
 * TIER 6: BOMB KICK VELOCITY AMPLIFICATION ON GLACIATED ICE
 * ============================================================================== */

test('Tier 6.1 [Bomb Kick Amplification]: Kicked bomb on glaciated tile accelerates to 450 px/s', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');
  scene.update(1200, 1200); // PERMAFROST_CREEP: friction = 0.25

  // Drop and kick bomb on glaciated tile (row 6, col 7)
  const frostBomb = scene.dropBomb(6, 7, 2, 3000);
  scene.kickBomb(frostBomb, 1, 0);

  assert.equal(frostBomb.slideSpeed, BOMB_KICK_FROST_SPEED, 'Bomb kick speed boosted to 450px/s');
  assert.equal(frostBomb.vx, 450);

  // Drop and kick bomb on normal corridor tile outside frost (row 1, col 1)
  const normalBomb = scene.dropBomb(1, 1, 2, 3000);
  scene.kickBomb(normalBomb, 0, 1);

  assert.equal(normalBomb.slideSpeed, 240, 'Normal kick speed is standard 240px/s');
  assert.equal(normalBomb.vy, 240);
});

/* ==============================================================================
 * TIER 7: BOMB BLAST THERMAL SHOCK SHATTER & LOCALIZED THAW CLEANSING
 * ============================================================================== */

test('Tier 7.1 [Thermal Shock Blast]: Detonating bomb in frost zone grants +2 power, +200 score, and localized thaw', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');
  scene.update(800, 800);

  const bomb = scene.dropBomb(6, 7, 2, 100);
  const initialScore = scene.score;

  // Verify tile is glaciated before blast
  assert.equal(scene.frostHazard.isPointGlaciated(bomb.x, bomb.y), true);

  // Force detonation
  const result = scene.explodeBomb(bomb);

  assert.equal(result.effectivePower, 2 + THERMAL_SHOCK_EXTRA_POWER, 'Power increased by +2');
  assert.equal(result.isPiercing, true, 'Blast is piercing');
  assert.equal(scene.score, initialScore + THERMAL_SHOCK_BONUS_SCORE, 'Score awarded +200 points');
  assert.ok(scene.floatingTexts.some((t) => t.text.includes('THERMAL SHOCK')), 'Thermal shock text displayed');

  // Verify hazard undergoes localized thaw cooldown and restores friction
  assert.equal(scene.frostHazard.getLifecycleState(), FrostLifecycleState.THAW_COOLDOWN, 'Detonation triggered localized thaw cooldown');
  assert.equal(scene.frostHazard.isTileLethal(bomb.r, bomb.c), false, 'Lethality eliminated during thaw cooldown');
  assert.equal(scene.frostHazard.evaluateFriction(bomb.x, bomb.y).isGlaciated, false, 'Surface is no longer glaciated during thaw');
  assert.equal(scene.frostHazard.evaluateFriction(bomb.x, bomb.y).friction, 1.0, 'Surface friction fully restored to 1.0');
});

/* ==============================================================================
 * TIER 8: ENVIRONMENTAL ENEMY FLASH-FREEZE & BOSS DEEP FREEZE STASIS
 * ============================================================================== */

test('Tier 8.1 [Minion Enemy Cryo-Shatter]: Minions in Absolute Zero Burst shatter for 120 damage and +120 score', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Spawn minion at frost center (row 6, col 7)
  const minion = scene.spawnEnemy('minion_1', 6, 7, false, 120);

  // Advance into Absolute Zero Burst
  scene.update(2050, 2050);

  assert.equal(minion.hp, 0, 'Minion took 120 damage and died');
  assert.equal(minion.isDead, true);
  assert.equal(scene.score, CRYO_FLASH_FREEZE_SCORE, 'Awarded +120 score bonus');
  assert.equal(scene.ultimateCharge, CRYO_FLASH_FREEZE_ULT_CHARGE, 'Awarded +6 ultimate charge');
  assert.ok(scene.floatingTexts.some((t) => t.text.includes('CRYO-SHATTERED') || t.text.includes('FLASH-FROZEN')));
});

test('Tier 8.2 [Boss Deep Freeze Stasis & Anti-Exploit Guard]: Boss takes 15% Max HP, 1.5s stun, and avoids multi-hits', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Spawn Boss with 1000 HP at frost center
  const boss = scene.spawnEnemy('boss_1', 6, 7, true, 1000);

  // Advance into Absolute Zero Burst (frame 1)
  scene.update(2050, 2050);

  const expectedDamage = Math.floor(1000 * BOSS_FROST_DAMAGE_RATIO); // 150
  assert.equal(boss.hp, 1000 - expectedDamage, 'Boss took exactly 15% Max HP damage (150)');
  assert.equal(boss.isStunned, true, 'Boss entered stasis');
  assert.equal(boss.stunUntil, 2050 + BOSS_DEEP_FREEZE_STUN_MS, 'Stun duration is exactly 1500ms');

  // Subsequent frame in same burst: Anti-Exploit Guard prevents duplicate hit
  scene.update(2070, 20);
  assert.equal(boss.hp, 1000 - expectedDamage, 'Boss takes NO additional damage in same burst');
});

/* ==============================================================================
 * TIER 9: MATHEMATICAL SAFE AREA INVARIANTS
 * ============================================================================== */

test('Tier 9.1 [Safe Area Guarantee]: FrostHazard maintains >= 40% safe area invariant (>= 80% observed)', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  const safeRatio = scene.frostHazard.getSafeAreaRatio();
  assert.ok(safeRatio >= 0.40, `Minimum safe area >= 40% violated: ${safeRatio}`);
  assert.ok(safeRatio >= MIN_FROST_SAFE_AREA_RATIO, `Observed safe area >= 80% on 13x15 arena: ${safeRatio}`);
  assert.equal(scene.frostHazard.getActiveFrostCount(), 29, 'Exactly 29 tiles in radius 3');
});

/* ==============================================================================
 * TIER 10: 1,000-FRAME RAPID CONTINUOUS SIMULATION STRESS SOAK
 * ============================================================================== */

test('Tier 10.1 [1,000-Frame Soak]: Rapid continuous frames with movement, bombs, kicks, and explosions execute with 0 errors', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  let simTime = 0;
  const frameDt = 16; // ~60fps

  for (let frame = 0; frame < 1000; frame++) {
    simTime += frameDt;

    // Simulate occasional player dash
    if (frame % 150 === 0) {
      scene.isDashing = true;
    } else if (frame % 150 === 10) {
      scene.isDashing = false;
    }

    // Simulate occasional bomb placement
    if (frame % 200 === 0) {
      const b = scene.dropBomb(6, 7, 2, 1200);
      if (frame % 400 === 0) {
        scene.kickBomb(b, 1, 0);
      }
    }

    // Simulate enemy spawn
    if (frame === 100) {
      scene.spawnEnemy(`mob_${frame}`, 6, 7, false, 120);
    }

    // Execute scene update
    assert.doesNotThrow(() => scene.update(simTime, frameDt));
  }

  // Teardown
  scene.shutdown();
  assert.equal(scene.frostHazard.state, FrostLifecycleState.DORMANT);
  assert.equal(scene.hazardGraphics.isCleared, true);
  assert.ok(true, '1,000 continuous frames completed with zero exceptions');
});
