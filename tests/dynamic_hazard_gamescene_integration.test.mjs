/**
 * tests/dynamic_hazard_gamescene_integration.test.mjs
 *
 * End-to-End Integration Test Suite for DynamicHazard & GameScene Subsystem
 * 2026-10-01 Daily Evolution Cycle — Creative Agent 7
 *
 * Covers:
 * Tier 1: Headless Mock Harness & Subsystem Verification
 * Tier 2: DynamicHazard Initialization in GameScene
 * Tier 3: Lifecycle Ticking during Scene Updates
 * Tier 4: Procedural Graphics Teardown & Shutdown Cleanliness
 * Tier 5: Tactical Bomb Placement & Subspace Hyper-Fuse Trigger
 * Tier 6: Bomb Blast Polarization Strike & Cleansing Wave
 * Tier 7: Player Quantum Tunneling Dash vs. Tachyon Shear
 * Tier 8: Environmental Enemy Vaporization & Boss Disruption
 * Tier 9: Headless Mock Resilience & Continuous Stress Soak
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  DynamicHazard,
  HazardLifecycleState,
  TelegraphPhase,
  TOTAL_TELEGRAPH_MS,
  POLARIZATION_DURATION_MS,
  HYPER_FUSE_MS,
  STANDARD_FUSE_MS,
  PLAYER_HAZARD_DAMAGE,
  MIN_SAFE_AREA_RATIO,
} from '../src/game/hazards/index.ts';

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
    this.pathOpen = false;
  }

  clear() {
    this.drawCalls.length = 0;
    this.isCleared = true;
    this.currentLineStyle = null;
    this.currentFillStyle = null;
    this.pathOpen = false;
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

  lineBetween(x1, y1, x2, y2) {
    this.isCleared = false;
    this.drawCalls.push({
      type: 'lineBetween',
      x1,
      y1,
      x2,
      y2,
      stroke: { ...this.currentLineStyle },
    });
  }

  beginPath() {
    this.pathOpen = true;
    this.drawCalls.push({ type: 'beginPath' });
  }

  moveTo(x, y) {
    this.drawCalls.push({ type: 'moveTo', x, y });
  }

  lineTo(x, y) {
    this.drawCalls.push({ type: 'lineTo', x, y });
  }

  closePath() {
    this.pathOpen = false;
    this.drawCalls.push({ type: 'closePath' });
  }

  fillPath() {
    this.isCleared = false;
    this.drawCalls.push({ type: 'fillPath', fill: { ...this.currentFillStyle } });
  }

  strokePath() {
    this.isCleared = false;
    this.drawCalls.push({ type: 'strokePath', stroke: { ...this.currentLineStyle } });
  }
}

/* ==============================================================================
 * HEADLESS GAMESCENE SIMULATOR FOR DYNAMIC HAZARD INTEGRATION
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

    // Scene Graphics & Visual Subsystem
    this.crisisGraphics = new MockGraphics();

    // Core Hazard & Crisis Engine
    this.dynamicHazard = new DynamicHazard();
    this.crisisManager = new CrisisManager();

    // World & Arena Map (13 rows x 15 cols standard Bomberman grid)
    this.map = this.createDefaultMap();
    this.dynamicHazard.init(this.map);

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

    // Screen-shake Trauma Simulator
    this.cameraTrauma = {
      trauma: 0,
      addTrauma(amount) {
        this.trauma = Math.min(1.0, this.trauma + amount);
      },
      update(delta) {
        const decayRate = 0.9;
        this.trauma = Math.max(0, this.trauma - (decayRate * delta) / 1000);
      },
    };

    // Feedback & Juice Hooks
    this.floatingTexts = [];
    this.hitStopDuration = 0;
    this.soundEvents = [];

    // Entities
    this.player = {
      x: 1 * TILE_SIZE + TILE_SIZE / 2,
      y: 1 * TILE_SIZE + TILE_SIZE / 2,
      hp: 100,
      maxHp: 100,
      speed: 160,
      baseSpeed: 160,
      isDashing: false,
      dashElapsedMs: 0,
      isInvulnerable: false,
      invulnerableUntil: 0,
      shieldInvulnerableUntil: 0,
      hasShield: false,
      phaseJitterUntil: 0,
      isDead: false,
    };

    this.bombs = [];
    this.enemies = [];
    this.score = 0;
    this.ultimateGauge = 0; // 0 to 100%

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
    this.dynamicHazard.start(stage);
    this.crisisManager.triggerCrisis(CrisisType.DIMENSIONAL_RIFTS);
    this.renderCrisisHazards(this.time.now);
  }

  stopCrisisMode() {
    this.dynamicHazard.stop();
    this.crisisManager.stopCrisis('reset');
    if (this.crisisGraphics) {
      this.crisisGraphics.clear();
    }
  }

  shutdown() {
    this.game.events.off('mode-changed', this.onModeChanged);
    this.stopCrisisMode();
    this.bombs.length = 0;
    this.enemies.length = 0;
    this.floatingTexts.length = 0;
    this.soundEvents.length = 0;
    this.time.delayedCalls.length = 0;
  }

  spawnEnemy(id, r, c, isBoss = false, hp = 100) {
    const enemy = {
      id,
      r,
      c,
      x: c * TILE_SIZE + TILE_SIZE / 2,
      y: r * TILE_SIZE + TILE_SIZE / 2,
      isBoss,
      hp,
      maxHp: hp,
      isStunned: false,
      stunUntil: 0,
      isVaporized: false,
      isAlive: true,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  spawnFloatingText(x, y, text, color) {
    this.floatingTexts.push({ x, y, text, color, timestamp: this.time.now });
  }

  triggerHitStop(durationMs) {
    this.hitStopDuration = durationMs;
  }

  dropBomb(r, c, power = 2) {
    const bombId = Date.now() + Math.floor(Math.random() * 1000);
    const standardFuse = STANDARD_FUSE_MS;

    // Check interaction with DynamicHazard
    const interaction = this.dynamicHazard.onBombPlaced(bombId, r, c, power, standardFuse);

    const bomb = {
      id: bombId,
      r,
      c,
      x: c * TILE_SIZE + TILE_SIZE / 2,
      y: r * TILE_SIZE + TILE_SIZE / 2,
      power,
      fuseMs: interaction.modifiedFuseMs,
      isEntangled: interaction.isEntangled,
      isGhost: false,
      parentBombId: null,
    };
    this.bombs.push(bomb);

    // If entangled and ghost bomb created, track ghost bomb
    if (interaction.isEntangled && interaction.ghostBombId !== undefined) {
      const ghosts = this.dynamicHazard.getActiveGhostBombs();
      const ghostData = ghosts.find((g) => g.id === interaction.ghostBombId);
      if (ghostData) {
        this.bombs.push({
          id: ghostData.id,
          r: ghostData.r,
          c: ghostData.c,
          x: ghostData.c * TILE_SIZE + TILE_SIZE / 2,
          y: ghostData.r * TILE_SIZE + TILE_SIZE / 2,
          power: ghostData.power,
          fuseMs: interaction.modifiedFuseMs,
          isEntangled: true,
          isGhost: true,
          parentBombId: bombId,
        });
      }
    }

    return bomb;
  }

  explodeBomb(bomb) {
    // 1. Detonate in DynamicHazard
    const rawDet = this.dynamicHazard.onBombDetonated(bomb.id, bomb.r, bomb.c, bomb.power);
    const detResult = {
      overcharged: rawDet.overcharged,
      modifiedPower: rawDet.modifiedPower,
      piercing: rawDet.piercing,
      pairedGhostBombIds: [...rawDet.pairedGhostBombIds],
    };

    // 2. Polarization Strike check on Spire Crystals within blast radius
    const strike = this.dynamicHazard.onBombBlastImpact(bomb.r, bomb.c);
    if (strike.polarized) {
      this.spawnFloatingText(bomb.x, bomb.y - 12, '✦ SPIRE POLARIZED!', '#FBBF24');
      this.soundEvents.push('POLARIZATION_BURST');
    }

    // 3. Detonate twin entangled ghost bombs synchronously
    if (detResult.pairedGhostBombIds && detResult.pairedGhostBombIds.length > 0) {
      for (const ghostId of detResult.pairedGhostBombIds) {
        const idx = this.bombs.findIndex((b) => b.id === ghostId);
        if (idx !== -1) {
          const ghostBomb = this.bombs[idx];
          this.bombs.splice(idx, 1);
          this.dynamicHazard.onBombDetonated(ghostBomb.id, ghostBomb.r, ghostBomb.c, ghostBomb.power);
        }
      }
    }

    // Remove exploded bomb
    const bIdx = this.bombs.indexOf(bomb);
    if (bIdx !== -1) {
      this.bombs.splice(bIdx, 1);
    }

    return {
      detResult,
      strike,
    };
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

    // 2. Camera trauma decay
    this.cameraTrauma.update(delta);

    // 3. Update DynamicHazard FSM
    this.dynamicHazard.update(delta);

    // 4. Update bomb fuses & check auto-detonation
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      if (!b) continue;
      b.fuseMs -= delta;
      if (b.fuseMs <= 0) {
        this.explodeBomb(b);
      }
    }

    // 5. Update Player State & Hazard Interaction
    const playerTileR = Math.floor(this.player.y / TILE_SIZE);
    const playerTileC = Math.floor(this.player.x / TILE_SIZE);

    if (this.player.isDashing) {
      this.player.dashElapsedMs += delta;
      if (this.player.dashElapsedMs > 140) {
        this.player.isDashing = false;
        this.player.dashElapsedMs = 0;
      }
    }

    if (this.player.shieldInvulnerableUntil > this.time.now) {
      this.player.isInvulnerable = true;
    } else {
      this.player.isInvulnerable = false;
    }

    // Hazard Collision Check for Player
    if (this.dynamicHazard.getState() === HazardLifecycleState.ACTIVE) {
      const colResult = this.dynamicHazard.checkPlayerCollision(
        playerTileR,
        playerTileC,
        this.player.isDashing,
        this.player.dashElapsedMs
      );

      if (colResult.hit) {
        if (colResult.tunneled && colResult.phaseShiftGranted) {
          // Quantum Tunneling Dash Mastery!
          this.player.isInvulnerable = true;
          this.player.shieldInvulnerableUntil = Math.max(
            this.player.shieldInvulnerableUntil,
            this.time.now + 1000
          );
          this.player.speed = this.player.baseSpeed + 45;
          this.time.delayedCall(2500, () => {
            this.player.speed = this.player.baseSpeed;
          });
          this.spawnFloatingText(this.player.x, this.player.y - 14, '✦ QUANTUM PHASED!', '#00E5FF');
          this.triggerHitStop(40);
          this.soundEvents.push('QUANTUM_TUNNELING');
        } else if (colResult.damage > 0 && !this.player.isInvulnerable) {
          // Normal Tachyon Shear Damage
          this.player.hp = Math.max(0, this.player.hp - colResult.damage);
          if (colResult.phaseJitterInflicted) {
            this.player.phaseJitterUntil = this.time.now + colResult.jitterDurationMs;
          }
          this.cameraTrauma.addTrauma(0.35);
          if (this.player.hp <= 0) {
            this.player.isDead = true;
          }
        }
      }
    }

    // 6. Hazard Collision Check for Enemies
    if (this.dynamicHazard.getState() === HazardLifecycleState.ACTIVE) {
      for (const enemy of this.enemies) {
        if (!enemy.isAlive) continue;

        const enemyTileR = Math.floor(enemy.y / TILE_SIZE);
        const enemyTileC = Math.floor(enemy.x / TILE_SIZE);

        const enemyCol = this.dynamicHazard.checkEnemyCollision(
          enemyTileR,
          enemyTileC,
          enemy.isBoss
        );

        if (enemyCol.hit) {
          if (enemyCol.isVaporized) {
            enemy.isVaporized = true;
            enemy.isAlive = false;
            enemy.hp = 0;
            this.score += enemyCol.scoreBonus;
            this.ultimateGauge = Math.min(100, this.ultimateGauge + 5);
            this.spawnFloatingText(enemy.x, enemy.y - 10, '+100 VAPORIZED!', '#38BDF8');
            this.soundEvents.push('ENEMY_VAPORIZED');
          } else if (enemyCol.isStunned) {
            if (!enemy.isStunned || enemy.stunUntil <= this.time.now) {
              enemy.isStunned = true;
              enemy.stunUntil = this.time.now + enemyCol.stunDurationMs;
              const dmg = enemy.isBoss ? (enemy.maxHp * enemyCol.damage) / 100 : enemyCol.damage;
              enemy.hp = Math.max(0, enemy.hp - dmg);
              this.spawnFloatingText(enemy.x, enemy.y - 10, '⚡ STUNNED (1.5s)!', '#FBBF24');
            }
          }
        }
      }
    }

    // 7. Render Procedural Graphics
    this.renderCrisisHazards(time);
  }

  renderCrisisHazards(time) {
    if (!this.crisisGraphics) return;
    this.crisisGraphics.clear();

    const state = this.dynamicHazard.getState();
    if (state === HazardLifecycleState.INACTIVE) return;

    const phase = this.dynamicHazard.getTelegraphPhase();
    const spires = this.dynamicHazard.getSpires();

    // 1. Render Spire Resonator Anchor Crystals
    for (const spire of spires) {
      const x = spire.c * TILE_SIZE + TILE_SIZE / 2;
      const y = spire.r * TILE_SIZE + TILE_SIZE / 2;
      const pulse = 0.85 + 0.15 * Math.sin(time / 140 + spire.idx);
      const crystalColor = spire.isPolarized ? 0xFBBF24 : 0x06B6D4;
      const coreColor = spire.isPolarized ? 0xFEF08A : 0xA5F3FC;

      this.crisisGraphics.lineStyle(2, crystalColor, 0.85 * pulse);
      this.crisisGraphics.strokeCircle(x, y, 18 * pulse);

      this.crisisGraphics.fillStyle(coreColor, 0.95);
      this.crisisGraphics.beginPath();
      this.crisisGraphics.moveTo(x, y - 14);
      this.crisisGraphics.lineTo(x + 10, y);
      this.crisisGraphics.lineTo(x, y + 14);
      this.crisisGraphics.lineTo(x - 10, y);
      this.crisisGraphics.closePath();
      this.crisisGraphics.fillPath();

      this.crisisGraphics.fillStyle(0xFFFFFF, 1.0);
      this.crisisGraphics.fillCircle(x, y, 3);
    }

    // 2. Render Telegraph & Active Corridors
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const isTelegraphed = this.dynamicHazard.isTileTelegraphed(r, c);
        const isLethal = this.dynamicHazard.isTileLethal(r, c);
        const isPolarized = this.dynamicHazard.isTilePolarized(r, c);

        if (!isTelegraphed && !isLethal && !isPolarized) continue;

        const left = c * TILE_SIZE;
        const top = r * TILE_SIZE;
        const y = top + TILE_SIZE / 2;

        if (isPolarized) {
          // Golden Cleansed Safe Corridor
          this.crisisGraphics.fillStyle(0xFACC15, 0.25);
          this.crisisGraphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          this.crisisGraphics.lineStyle(1.5, 0xFEF08A, 0.6);
          this.crisisGraphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else if (state === HazardLifecycleState.TELEGRAPH) {
          if (phase === TelegraphPhase.YELLOW) {
            this.crisisGraphics.fillStyle(0x00E5FF, 0.22);
            this.crisisGraphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            this.crisisGraphics.lineStyle(1, 0x38BDF8, 0.45);
            this.crisisGraphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          } else if (phase === TelegraphPhase.AMBER) {
            const amberPulse = 0.4 + 0.25 * Math.sin(time / 80 + r * COLS + c);
            this.crisisGraphics.fillStyle(0xA855F7, amberPulse);
            this.crisisGraphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            this.crisisGraphics.lineStyle(2, 0xD946EF, 0.75);
            this.crisisGraphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          } else if (phase === TelegraphPhase.RED) {
            this.crisisGraphics.fillStyle(0xEF4444, 0.75);
            this.crisisGraphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            this.crisisGraphics.lineStyle(2.5, 0xB8254A, 0.95);
            this.crisisGraphics.strokeRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }
        } else if (state === HazardLifecycleState.ACTIVE) {
          // White Flash Peak Discharge
          this.crisisGraphics.fillStyle(0xFFFFFF, 0.92);
          this.crisisGraphics.fillRect(left, top, TILE_SIZE, TILE_SIZE);
          this.crisisGraphics.lineStyle(3, 0xFFFFFF, 1.0);
          this.crisisGraphics.lineBetween(left, y, left + TILE_SIZE, y);
        }
      }
    }

    // 3. Render Entangled Ghost Bombs
    const activeGhosts = this.dynamicHazard.getActiveGhostBombs();
    for (const ghost of activeGhosts) {
      const gx = ghost.c * TILE_SIZE + TILE_SIZE / 2;
      const gy = ghost.r * TILE_SIZE + TILE_SIZE / 2;
      const gPulse = 0.8 + 0.2 * Math.sin(time / 100);

      this.crisisGraphics.fillStyle(0x00E5FF, 0.5 * gPulse);
      this.crisisGraphics.fillCircle(gx, gy, 14 * gPulse);
      this.crisisGraphics.lineStyle(2, 0xFFFFFF, 0.9);
      this.crisisGraphics.strokeCircle(gx, gy, 16);
    }
  }
}

/* ==============================================================================
 * TIER 1: HEADLESS MOCK HARNESS & SUBSYSTEM VERIFICATION
 * ============================================================================== */

test('Tier 1 [Headless Mock]: HeadlessGameScene constructs with event emitters, mocked graphics context, and zero leaks', () => {
  const scene = new HeadlessGameScene();
  assert.ok(scene.crisisGraphics, 'crisisGraphics must exist');
  assert.ok(scene.dynamicHazard, 'dynamicHazard must exist');
  assert.ok(scene.crisisManager, 'crisisManager must exist');
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.INACTIVE);
  assert.equal(scene.crisisGraphics.isCleared, true);

  // Test graphics drawing operations recording
  scene.crisisGraphics.fillStyle(0x00E5FF, 0.5);
  scene.crisisGraphics.fillRect(10, 20, 30, 40);
  assert.equal(scene.crisisGraphics.isCleared, false);
  assert.equal(scene.crisisGraphics.drawCalls.length, 2);

  scene.crisisGraphics.clear();
  assert.equal(scene.crisisGraphics.isCleared, true);
  assert.equal(scene.crisisGraphics.drawCalls.length, 0);

  scene.shutdown();
});

/* ==============================================================================
 * TIER 2: DYNAMIC HAZARD INITIALIZATION IN GAMESCENE
 * ============================================================================== */

test('Tier 2 [Scene Initialization]: GameScene cleanly initializes DynamicHazard topology and binds arena layout', () => {
  const scene = new HeadlessGameScene();
  const spires = scene.dynamicHazard.getSpires();

  assert.equal(spires.length, 5, 'Spire topology must have exactly 5 nodes');
  assert.equal(spires[0].r, 3);
  assert.equal(spires[0].c, 4);
  assert.equal(spires[1].r, 9);
  assert.equal(spires[1].c, 4);
  assert.equal(spires[2].r, 6);
  assert.equal(spires[2].c, 3);
  assert.equal(spires[3].r, 6);
  assert.equal(spires[3].c, 11);
  assert.equal(spires[4].r, 6);
  assert.equal(spires[4].c, 7);

  // Verify initial stage and inactive lifecycle state
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.INACTIVE);
  assert.equal(scene.dynamicHazard.getTelegraphPhase(), TelegraphPhase.NONE);

  scene.shutdown();
});

test('Tier 2 [Mode Transition]: Emitting mode-changed event triggers crisis survival and activates hazard', () => {
  const scene = new HeadlessGameScene();
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.INACTIVE);

  // Dispatch mode-changed to CRISIS_SURVIVAL
  scene.game.events.emit('mode-changed', 'CRISIS_SURVIVAL');
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.COOLDOWN);
  assert.equal(scene.crisisManager.getActiveCrisis()?.id, CrisisType.DIMENSIONAL_RIFTS);

  // Graphics drawn for Spire crystals
  assert.equal(scene.crisisGraphics.isCleared, false);
  assert.ok(scene.crisisGraphics.drawCalls.length > 0, 'Spire crystals must be rendered on activation');

  // Dispatch mode-changed to STANDARD -> stops hazard
  scene.game.events.emit('mode-changed', 'STANDARD');
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.INACTIVE);
  assert.equal(scene.crisisGraphics.isCleared, true);

  scene.shutdown();
});

test('Tier 2 [Fair Encounter Guarantee]: Mathematical safe area ratio >= 40% maintained across Outbreak and Climax stages', () => {
  const scene = new HeadlessGameScene();

  // Test Outbreak safe area ratio
  scene.startCrisisMode('OUTBREAK');
  scene.update(2000 + TOTAL_TELEGRAPH_MS, 2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE
  const outbreakRatio = scene.dynamicHazard.getSafeAreaRatio();
  assert.ok(
    outbreakRatio >= MIN_SAFE_AREA_RATIO,
    `Outbreak safe ratio ${outbreakRatio} must exceed minimum ${MIN_SAFE_AREA_RATIO}`
  );
  assert.ok(outbreakRatio >= 0.85, 'Outbreak safe area should be >= 85%');

  // Test Climax safe area ratio (Synchronized dual-axis beam)
  scene.startCrisisMode('CLIMAX');
  scene.update(2000 + TOTAL_TELEGRAPH_MS, 2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE
  const climaxRatio = scene.dynamicHazard.getSafeAreaRatio();
  assert.ok(
    climaxRatio >= MIN_SAFE_AREA_RATIO,
    `Climax safe ratio ${climaxRatio} must exceed minimum ${MIN_SAFE_AREA_RATIO}`
  );
  assert.ok(climaxRatio >= 0.75, 'Climax safe area should be >= 75%');

  scene.shutdown();
});

/* ==============================================================================
 * TIER 3: LIFECYCLE TICKING DURING SCENE UPDATES
 * ============================================================================== */

test('Tier 3 [Lifecycle Ticking]: scene.update() advances FSM through Yellow -> Amber -> Red -> Active -> Cooldown', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');
  let currentTime = 1000;

  // 1. Initial warmup in COOLDOWN (2000ms)
  scene.update(currentTime, 1000);
  currentTime += 1000;
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.COOLDOWN);

  scene.update(currentTime, 1000);
  currentTime += 1000;
  // Transitions to TELEGRAPH Yellow
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.TELEGRAPH);
  assert.equal(scene.dynamicHazard.getTelegraphPhase(), TelegraphPhase.YELLOW);

  // Check that procedural graphics contains Yellow telegraph calls (0x00E5FF)
  const yellowFills = scene.crisisGraphics.drawCalls.filter(
    (c) => c.type === 'fillStyle' && c.color === 0x00E5FF
  );
  assert.ok(yellowFills.length > 0, 'Must render Yellow telegraph corridor');

  // 2. Advance through Yellow (1000ms) -> enters Amber (500ms)
  scene.update(currentTime, 1000);
  currentTime += 1000;
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.TELEGRAPH);
  assert.equal(scene.dynamicHazard.getTelegraphPhase(), TelegraphPhase.AMBER);
  const amberFills = scene.crisisGraphics.drawCalls.filter(
    (c) => c.type === 'fillStyle' && c.color === 0xA855F7
  );
  assert.ok(amberFills.length > 0, 'Must render Amber telegraph corridor');

  // 3. Advance through Amber (500ms) -> enters Red (500ms)
  scene.update(currentTime, 500);
  currentTime += 500;
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.TELEGRAPH);
  assert.equal(scene.dynamicHazard.getTelegraphPhase(), TelegraphPhase.RED);
  const redFills = scene.crisisGraphics.drawCalls.filter(
    (c) => c.type === 'fillStyle' && c.color === 0xEF4444
  );
  assert.ok(redFills.length > 0, 'Must render Red locked corridor');

  // 4. Advance through Red (500ms) -> enters ACTIVE Tachyon Discharge (300ms)
  scene.update(currentTime, 500);
  currentTime += 500;
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.ACTIVE);
  assert.equal(scene.dynamicHazard.getTelegraphPhase(), TelegraphPhase.NONE);
  const whiteFills = scene.crisisGraphics.drawCalls.filter(
    (c) => c.type === 'fillStyle' && c.color === 0xFFFFFF
  );
  assert.ok(whiteFills.length > 0, 'Must render White Flash discharge');

  // 5. Advance through Active (300ms) -> enters COOLDOWN (5700ms)
  scene.update(currentTime, 300);
  currentTime += 300;
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.COOLDOWN);
  assert.equal(scene.dynamicHazard.getActiveBeamCount(), 0, 'Beam tiles must be zero in Cooldown');

  scene.shutdown();
});

/* ==============================================================================
 * TIER 4: PROCEDURAL GRAPHICS CLEARING ON SHUTDOWN
 * ============================================================================== */

test('Tier 4 [Teardown & Shutdown]: scene.shutdown() cleanly clears crisisGraphics and stops all hazard timers', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('CLIMAX');
  scene.update(1000, 2000); // Enter telegraph
  assert.equal(scene.crisisGraphics.isCleared, false);
  assert.ok(scene.crisisGraphics.drawCalls.length > 0);

  // Trigger shutdown
  scene.shutdown();

  // Invariants post-shutdown
  assert.equal(scene.crisisGraphics.isCleared, true, 'crisisGraphics must be cleared on shutdown');
  assert.equal(scene.crisisGraphics.drawCalls.length, 0);
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.INACTIVE);
  assert.equal(scene.dynamicHazard.getActiveBeamCount(), 0);
  assert.equal(scene.bombs.length, 0);
  assert.equal(scene.enemies.length, 0);
  assert.equal(scene.time.delayedCalls.length, 0);
});

test('Tier 4 [Rapid Shutdown & Restart]: 20 consecutive start -> update -> shutdown cycles execute with 0 orphaned state', () => {
  const scene = new HeadlessGameScene();

  for (let cycle = 0; cycle < 20; cycle++) {
    scene.startCrisisMode(cycle % 2 === 0 ? 'OUTBREAK' : 'CLIMAX');
    scene.update(cycle * 1000, 500);
    assert.equal(scene.crisisGraphics.isCleared, false);

    scene.stopCrisisMode();
    assert.equal(scene.crisisGraphics.isCleared, true);
    assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.INACTIVE);
    assert.equal(scene.dynamicHazard.getActiveBeamCount(), 0);
  }

  scene.shutdown();
  assert.equal(scene.crisisGraphics.isCleared, true);
});

/* ==============================================================================
 * TIER 5: TACTICAL BOMB PLACEMENT & SUBSPACE HYPER-FUSE TRIGGER
 * ============================================================================== */

test('Tier 5 [Bomb Hyper-Fuse]: Placing bomb on Spire anchor compresses fuse to 1500ms and links ghost bomb', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Place bomb on Spire S0 at (3, 4)
  const bombOnAnchor = scene.dropBomb(3, 4, 3);
  assert.equal(bombOnAnchor.fuseMs, HYPER_FUSE_MS, 'Bomb on anchor must have 1500ms Hyper-Fuse');
  assert.equal(bombOnAnchor.isEntangled, true);

  // Verify ghost bomb materialized in scene at paired Spire S1 at (9, 4)
  const ghostBomb = scene.bombs.find((b) => b.isGhost);
  assert.ok(ghostBomb, 'Ghost bomb must be spawned in scene');
  assert.equal(ghostBomb.r, 9);
  assert.equal(ghostBomb.c, 4);
  assert.equal(ghostBomb.parentBombId, bombOnAnchor.id);
  assert.equal(ghostBomb.power, 3);
  assert.equal(ghostBomb.fuseMs, HYPER_FUSE_MS);

  // Place normal bomb distant from any spire at (1, 1)
  const normalBomb = scene.dropBomb(1, 1, 2);
  assert.equal(normalBomb.fuseMs, STANDARD_FUSE_MS, 'Normal bomb must maintain 3000ms fuse');
  assert.equal(normalBomb.isEntangled, false);

  scene.shutdown();
});

test('Tier 5 [Entangled Detonation]: Detonating primary bomb detonates ghost bomb synchronously on the same frame', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Place entangled bomb directly on Spire S0 at (3, 4)
  const primaryBomb = scene.dropBomb(3, 4, 2);
  assert.equal(scene.bombs.length, 2, 'Must have primary and ghost bomb');
  assert.equal(primaryBomb.fuseMs, HYPER_FUSE_MS);

  // Ticking time to trigger auto-detonation via fuse (1500ms)
  scene.update(1000, HYPER_FUSE_MS);

  // Both bombs must detonate synchronously and be removed from scene.bombs
  assert.equal(scene.bombs.length, 0, 'Both primary and ghost bombs must detonate on same frame');
  assert.equal(scene.dynamicHazard.getActiveGhostBombs().length, 0, 'Ghost bomb pool slot must be freed');

  scene.shutdown();
});

test('Tier 5 [Tachyon Overcharge]: Detonating bomb on active beam grants +2 power and piercing beam', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Fast forward to active discharge (Col 4 active)
  scene.update(2000 + TOTAL_TELEGRAPH_MS, 2000 + TOTAL_TELEGRAPH_MS);
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.ACTIVE);

  // Place and explode bomb directly in beam path at (5, 4)
  const bomb = scene.dropBomb(5, 4, 2);
  const result = scene.explodeBomb(bomb);

  assert.equal(result.detResult.overcharged, true);
  assert.equal(result.detResult.modifiedPower, 4, 'Must gain +2 blast power (2 -> 4)');
  assert.equal(result.detResult.piercing, true);

  scene.shutdown();
});

/* ==============================================================================
 * TIER 6: BOMB BLAST POLARIZATION STRIKE & CLEANSING WAVE
 * ============================================================================== */

test('Tier 6 [Polarization Strike]: Blast hitting Spire anchor polarizes pair for 8.0s and renders golden corridor', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Place bomb at (3, 4) and explode it
  const bomb = scene.dropBomb(3, 4, 2);
  const { strike } = scene.explodeBomb(bomb);

  assert.equal(strike.polarized, true);
  assert.equal(strike.spireId, 0);
  assert.ok(scene.soundEvents.includes('POLARIZATION_BURST'));
  assert.ok(
    scene.floatingTexts.some((t) => t.text === '✦ SPIRE POLARIZED!'),
    'Must display SPIRE POLARIZED floating combat text'
  );

  // Fast forward to active beam discharge while polarized
  scene.update(2000 + TOTAL_TELEGRAPH_MS, 2000 + TOTAL_TELEGRAPH_MS);
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.ACTIVE);
  assert.equal(scene.dynamicHazard.isTilePolarized(3, 4), true);

  // Procedural graphics must render golden cleansed corridor (0xFACC15)
  const goldFills = scene.crisisGraphics.drawCalls.filter(
    (c) => c.type === 'fillStyle' && c.color === 0xFACC15
  );
  assert.ok(goldFills.length > 0, 'Must render golden cleansed corridor during polarized discharge');

  // Player stepping on polarized beam takes 0 damage
  scene.player.x = 4 * TILE_SIZE + TILE_SIZE / 2;
  scene.player.y = 5 * TILE_SIZE + TILE_SIZE / 2; // (5, 4) on polarized beam
  const prevHp = scene.player.hp;
  scene.update(3000, 16.6);
  assert.equal(scene.player.hp, prevHp, 'Polarized beam must deal 0 damage to player');

  // Advance time past 8000ms -> polarization expires cleanly
  scene.update(10000, POLARIZATION_DURATION_MS + 100);
  assert.equal(scene.dynamicHazard.getSpires()[0].isPolarized, false, 'Polarization must expire after 8.0s');

  scene.shutdown();
});

/* ==============================================================================
 * TIER 7: PLAYER QUANTUM TUNNELING DASH VS TACHYON SHEAR
 * ============================================================================== */

test('Tier 7 [Quantum Tunneling Dash]: Dashing across active beam during 150ms window negates damage and grants Phase Shift', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Advance into ACTIVE discharge (Col 4 lethal)
  scene.update(2000 + TOTAL_TELEGRAPH_MS, 2000 + TOTAL_TELEGRAPH_MS);
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.ACTIVE);

  // Position player on active beam at (5, 4)
  scene.player.x = 4 * TILE_SIZE + TILE_SIZE / 2;
  scene.player.y = 5 * TILE_SIZE + TILE_SIZE / 2;

  // Player initiates Dash within first 150ms window (e.g. 50ms into dash)
  scene.player.isDashing = true;
  scene.player.dashElapsedMs = 50;
  const initialHp = scene.player.hp;

  scene.update(5000, 16.6);

  // Assertions: 0 damage taken, Phase Shift granted, speed boost, floating text
  assert.equal(scene.player.hp, initialHp, 'Quantum Tunneling must take 0 damage');
  assert.equal(scene.player.isInvulnerable, true, 'Must be granted intangibility I-frames');
  assert.ok(scene.player.shieldInvulnerableUntil > scene.time.now);
  assert.equal(scene.player.speed, scene.player.baseSpeed + 45, 'Must receive +45 speed boost');
  assert.ok(scene.soundEvents.includes('QUANTUM_TUNNELING'));
  assert.ok(
    scene.floatingTexts.some((t) => t.text === '✦ QUANTUM PHASED!'),
    'Must display QUANTUM PHASED combat text'
  );
  assert.equal(scene.hitStopDuration, 40, 'Must trigger 40ms hitstop');

  scene.shutdown();
});

test('Tier 7 [Tachyon Shear Damage]: Non-dashing player caught in active beam takes 25 damage, Phase Jitter, and trauma', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Advance into ACTIVE discharge
  scene.update(2000 + TOTAL_TELEGRAPH_MS, 2000 + TOTAL_TELEGRAPH_MS);
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.ACTIVE);

  // Position player on active beam at (5, 4) without dashing
  scene.player.x = 4 * TILE_SIZE + TILE_SIZE / 2;
  scene.player.y = 5 * TILE_SIZE + TILE_SIZE / 2;
  scene.player.isDashing = false;
  scene.player.isInvulnerable = false;
  const initialHp = scene.player.hp;

  scene.update(5000, 16.6);

  // Assertions: Takes 25 damage, receives Phase Jitter debuff, camera trauma added
  assert.equal(scene.player.hp, initialHp - PLAYER_HAZARD_DAMAGE, 'Player must take 25 energy damage');
  assert.ok(scene.player.phaseJitterUntil > scene.time.now, 'Must be afflicted with Phase Jitter debuff');
  assert.ok(scene.cameraTrauma.trauma >= 0.35, 'Camera trauma must be >= 0.35');

  scene.shutdown();
});

test('Tier 7 [Spatial Ejection]: Entity standing directly on Spire anchor is safely displaced to adjacent walkable tile on activation', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Place player directly on Spire S0 anchor tile (3, 4)
  scene.player.x = 4 * TILE_SIZE + TILE_SIZE / 2;
  scene.player.y = 3 * TILE_SIZE + TILE_SIZE / 2;

  // Resolve safe spatial displacement via dynamicHazard
  const playerTileR = Math.floor(scene.player.y / TILE_SIZE);
  const playerTileC = Math.floor(scene.player.x / TILE_SIZE);
  const ejection = scene.dynamicHazard.resolveSafeEjection(playerTileR, playerTileC);

  assert.equal(ejection.displaced, true, 'Entity on anchor must be displaced');
  assert.notEqual(ejection.r === 3 && ejection.c === 4, true, 'Must be moved off anchor coordinate');
  assert.equal(
    Math.abs(ejection.r - 3) + Math.abs(ejection.c - 4),
    1,
    'Must be displaced exactly 1 tile orthogonally'
  );

  // Apply displacement to player
  scene.player.x = ejection.c * TILE_SIZE + TILE_SIZE / 2;
  scene.player.y = ejection.r * TILE_SIZE + TILE_SIZE / 2;
  assert.equal(Math.floor(scene.player.y / TILE_SIZE), ejection.r);
  assert.equal(Math.floor(scene.player.x / TILE_SIZE), ejection.c);

  scene.shutdown();
});

/* ==============================================================================
 * TIER 8: ENVIRONMENTAL ENEMY VAPORIZATION & BOSS DISRUPTION
 * ============================================================================== */

test('Tier 8 [Minion Vaporization]: Enemy minion in active beam is vaporized, awarding +100 score and +5% ult', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Spawn minion enemy on Col 4 (5, 4)
  const minion = scene.spawnEnemy(101, 5, 4, false, 50);
  assert.equal(minion.isAlive, true);

  // Advance into ACTIVE beam discharge
  scene.update(2000 + TOTAL_TELEGRAPH_MS, 2000 + TOTAL_TELEGRAPH_MS);
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.ACTIVE);

  // Run update tick
  scene.update(5000, 16.6);

  // Assertions: Minion vaporized, dead, score increased by 100, ult increased by 5
  assert.equal(minion.isVaporized, true, 'Minion must be vaporized');
  assert.equal(minion.isAlive, false, 'Minion must be dead');
  assert.equal(scene.score, 100, 'Score must increase by +100');
  assert.equal(scene.ultimateGauge, 5, 'Ultimate gauge must increase by +5%');
  assert.ok(scene.soundEvents.includes('ENEMY_VAPORIZED'));
  assert.ok(
    scene.floatingTexts.some((t) => t.text.includes('+100 VAPORIZED!')),
    'Must spawn +100 VAPORIZED floating text'
  );

  scene.shutdown();
});

test('Tier 8 [Boss Stun & Percentage Damage]: Boss enemy in active beam takes 15% damage and suffers 1.5s stun', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  // Spawn boss enemy with 1000 HP on Col 4 (5, 4)
  const boss = scene.spawnEnemy(201, 5, 4, true, 1000);
  assert.equal(boss.isBoss, true);

  // Advance into ACTIVE beam discharge
  scene.update(2000 + TOTAL_TELEGRAPH_MS, 2000 + TOTAL_TELEGRAPH_MS);
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.ACTIVE);

  // Run update tick
  scene.update(5000, 16.6);

  // Assertions: Boss not vaporized, takes 15% damage (150 HP), stunned for 1500ms
  assert.equal(boss.isVaporized, false, 'Boss must not be vaporized');
  assert.equal(boss.isAlive, true, 'Boss must survive');
  assert.equal(boss.hp, 850, 'Boss must take 150 damage (15% of 1000)');
  assert.equal(boss.isStunned, true, 'Boss must be stunned');
  assert.ok(boss.stunUntil > scene.time.now);
  assert.ok(
    scene.floatingTexts.some((t) => t.text.includes('⚡ STUNNED (1.5s)!')),
    'Must spawn STUNNED floating text'
  );

  scene.shutdown();
});

/* ==============================================================================
 * TIER 9: HEADLESS MOCK RESILIENCE & CONTINUOUS STRESS SOAK
 * ============================================================================== */

test('Tier 9 [Resilience & Stress]: 1,000 continuous frames execute with concurrent bombs, entities, and transitions without crash', () => {
  const scene = new HeadlessGameScene();
  scene.startCrisisMode('OUTBREAK');

  let simTime = 0;
  const delta = 16.666;

  for (let f = 0; f < 1000; f++) {
    simTime += delta;

    // Periodic actions to stress subsystems
    if (f % 60 === 0) {
      scene.dropBomb(3, 4, 2); // Place bomb on anchor
      scene.spawnEnemy(300 + f, 5, 4, false, 50); // Spawn minion on beam
    }

    if (f % 120 === 0) {
      // Trigger player dash across beam
      scene.player.x = 4 * TILE_SIZE + TILE_SIZE / 2;
      scene.player.y = 5 * TILE_SIZE + TILE_SIZE / 2;
      scene.player.isDashing = true;
      scene.player.dashElapsedMs = 30;
    }

    if (f === 500) {
      // Mid-stream transition to Climax stage
      scene.startCrisisMode('CLIMAX');
    }

    // Step frame
    scene.update(simTime, delta);

    // Invariant checks
    assert.ok(Number.isFinite(scene.player.x));
    assert.ok(Number.isFinite(scene.player.y));
    assert.ok(Number.isFinite(scene.cameraTrauma.trauma));
    assert.ok(scene.cameraTrauma.trauma >= 0 && scene.cameraTrauma.trauma <= 1.0);
  }

  // Teardown cleanly
  scene.shutdown();
  assert.equal(scene.crisisGraphics.isCleared, true);
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.INACTIVE);
});
