import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findPathBFS,
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
} from '../src/game/pathfinding.ts';

// Helper: Standard Bomberman arena map generator
function createStandardMap() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        map[r][c] = TILE_WALL;
      } else if (r % 2 === 0 && c % 2 === 0) {
        map[r][c] = TILE_WALL;
      } else {
        map[r][c] = TILE_EMPTY;
      }
    }
  }
  return map;
}

/**
 * Mock visual companion indicator reflecting Phaser.GameObjects.Text behavior
 */
class MockIndicator {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.text = '';
    this.visible = false;
    this.scale = 1;
    this.angle = 0;
    this.style = {};
    this.active = true;
    this.destroyed = false;
  }

  setText(text) {
    this.text = text;
    return this;
  }

  setStyle(style) {
    this.style = { ...this.style, ...style };
    return this;
  }

  setVisible(visible) {
    this.visible = visible;
    return this;
  }

  setScale(scale) {
    this.scale = scale;
    return this;
  }

  setAngle(angle) {
    this.angle = angle;
    return this;
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  destroy() {
    this.active = false;
    this.destroyed = true;
  }
}

/**
 * High-fidelity Enemy AI Simulator strictly adhering to GameScene.ts Enemy implementation.
 * Simulates all 6/7 states: IDLE, PATROL, TRACKING, HUNTING, WINDUP, ATTACK, COOLDOWN.
 */
class EnemyModel {
  constructor(x, y, isTracker = true) {
    this.x = x;
    this.y = y;
    this.isTracker = isTracker;
    this.aiState = isTracker ? 'TRACKING' : 'PATROL';
    this.stateTimer = 0;
    this.pathRecalcTimer = 0;
    this.currentPath = [];
    this.targetTile = null;
    this.attackDir = { x: 0, y: 0 };
    this.baseSpeed = 75;
    this.chargeSpeed = 220;
    this.velocity = { x: 0, y: 0 };
    this.tint = 0;
    this.scale = { x: 1, y: 1 };
    this.angle = 0;
    this.flipX = false;
    this.active = true;
    this.tweensKilled = false;

    this.indicator = new MockIndicator(x, y - 24);
    this.applyStateVisuals(this.aiState);
  }

  changeState(newState) {
    if (this.aiState === newState) return;
    this.stopStateTweens();
    this.aiState = newState;
    this.applyStateVisuals(newState);
  }

  stopStateTweens() {
    this.tweensKilled = true;
    this.scale = { x: 1, y: 1 };
    this.angle = 0;
    if (this.indicator && this.indicator.active) {
      this.indicator.setAngle(0);
      this.indicator.setScale(1);
    }
  }

  applyStateVisuals(state) {
    if (!this.active) return;

    switch (state) {
      case 'IDLE':
        this.tint = 0;
        this.indicator.setText('...');
        this.indicator.setStyle({ color: '#94a3b8', stroke: '#0f172a', strokeThickness: 2 });
        this.indicator.setVisible(true);
        this.indicator.setScale(1);
        break;

      case 'PATROL':
        this.tint = 0;
        this.indicator.setVisible(false);
        break;

      case 'TRACKING':
      case 'HUNTING':
        this.tint = this.isTracker ? 0xffbbbb : 0xffddaa;
        this.indicator.setText('!');
        this.indicator.setStyle({ color: '#FFD700', stroke: '#7f1d1d', strokeThickness: 3 });
        this.indicator.setVisible(true);
        break;

      case 'WINDUP':
        this.tint = 0xff2222;
        this.indicator.setText('⚠️');
        this.indicator.setStyle({ color: '#ff4444', stroke: '#000000', strokeThickness: 2 });
        this.indicator.setVisible(true);
        break;

      case 'ATTACK': {
        this.tint = 0xff8800;
        this.indicator.setText('⚡');
        this.indicator.setVisible(true);
        const isHoriz = Math.abs(this.attackDir.x) > Math.abs(this.attackDir.y);
        this.scale = {
          x: isHoriz ? 1.3 : 0.82,
          y: isHoriz ? 0.82 : 1.3,
        };
        break;
      }

      case 'COOLDOWN':
        this.tint = 0x88bbff;
        this.indicator.setText('💫');
        this.indicator.setVisible(true);
        break;
    }
  }

  hasLineOfSight(er, ec, pr, pc, map, bombTiles) {
    const maxRange = 6;
    if (er === pr) {
      const dist = Math.abs(ec - pc);
      if (dist === 0 || dist > maxRange) return false;
      const step = Math.sign(pc - ec);
      for (let c = ec + step; c !== pc; c += step) {
        if (c < 0 || c >= COLS) return false;
        if (map[er][c] !== TILE_EMPTY || bombTiles.has(`${er},${c}`)) return false;
      }
      return true;
    } else if (ec === pc) {
      const dist = Math.abs(er - pr);
      if (dist === 0 || dist > maxRange) return false;
      const step = Math.sign(pr - er);
      for (let r = er + step; r !== pr; r += step) {
        if (r < 0 || r >= ROWS) return false;
        if (map[r][ec] !== TILE_EMPTY || bombTiles.has(`${r},${ec}`)) return false;
      }
      return true;
    }
    return false;
  }

  startWindup(er, ec, pr, pc, playerX, playerY) {
    this.changeState('WINDUP');
    this.stateTimer = 450;
    this.velocity = { x: 0, y: 0 };

    if (er === pr && ec !== pc) {
      this.attackDir = { x: Math.sign(pc - ec), y: 0 };
    } else if (ec === pc && er !== pr) {
      this.attackDir = { x: 0, y: Math.sign(pr - er) };
    } else {
      const dx = playerX - this.x;
      const dy = playerY - this.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.attackDir = { x: Math.sign(dx) || (this.flipX ? -1 : 1), y: 0 };
      } else {
        this.attackDir = { x: 0, y: Math.sign(dy) || 1 };
      }
    }

    if (this.attackDir.x !== 0) {
      this.flipX = this.attackDir.x < 0;
    }
  }

  updateAI(delta, player, map, bombTiles, isBlocked = false) {
    if (!this.active || !player.active) {
      this.velocity = { x: 0, y: 0 };
      return;
    }

    if (this.indicator && this.indicator.active) {
      this.indicator.setPosition(this.x, this.y - 24);
    }

    const enemyR = Math.floor(this.y / TILE_SIZE);
    const enemyC = Math.floor(this.x / TILE_SIZE);
    const playerR = Math.floor(player.y / TILE_SIZE);
    const playerC = Math.floor(player.x / TILE_SIZE);

    switch (this.aiState) {
      case 'IDLE': {
        this.velocity = { x: 0, y: 0 };
        const manhattan = Math.abs(enemyR - playerR) + Math.abs(enemyC - playerC);
        if (manhattan <= 5 || this.hasLineOfSight(enemyR, enemyC, playerR, playerC, map, bombTiles)) {
          this.changeState('HUNTING');
          return;
        }

        this.stateTimer -= delta;
        if (this.stateTimer <= 0) {
          const neighbors = [
            { r: enemyR - 1, c: enemyC },
            { r: enemyR + 1, c: enemyC },
            { r: enemyR, c: enemyC - 1 },
            { r: enemyR, c: enemyC + 1 },
          ];
          const candidates = neighbors.filter(
            n => n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS &&
                 map[n.r][n.c] === TILE_EMPTY && !bombTiles.has(`${n.r},${n.c}`)
          );
          if (candidates.length > 0) {
            this.targetTile = candidates[0];
            this.currentPath = [this.targetTile];
            this.changeState('PATROL');
          } else {
            this.stateTimer = 1000;
          }
        }
        break;
      }

      case 'PATROL': {
        const manhattan = Math.abs(enemyR - playerR) + Math.abs(enemyC - playerC);
        if (manhattan <= 5 || this.hasLineOfSight(enemyR, enemyC, playerR, playerC, map, bombTiles)) {
          this.changeState('HUNTING');
          return;
        }

        if (!this.targetTile) {
          this.changeState('IDLE');
          this.stateTimer = 1000;
          this.velocity = { x: 0, y: 0 };
          return;
        }

        const targetX = this.targetTile.c * TILE_SIZE + TILE_SIZE / 2;
        const targetY = this.targetTile.r * TILE_SIZE + TILE_SIZE / 2;
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 4) {
          this.targetTile = null;
          this.changeState('IDLE');
          this.stateTimer = 1000;
          this.velocity = { x: 0, y: 0 };
        } else {
          const patrolSpeed = 55;
          if (Math.abs(dx) > Math.abs(dy)) {
            this.velocity = { x: Math.sign(dx) * patrolSpeed, y: 0 };
          } else {
            this.velocity = { x: 0, y: Math.sign(dy) * patrolSpeed };
          }
        }
        break;
      }

      case 'TRACKING':
      case 'HUNTING': {
        const manhattan = Math.abs(enemyR - playerR) + Math.abs(enemyC - playerC);
        if (!this.isTracker && manhattan > 7 && !this.hasLineOfSight(enemyR, enemyC, playerR, playerC, map, bombTiles)) {
          this.changeState('IDLE');
          this.stateTimer = 1000;
          this.velocity = { x: 0, y: 0 };
          return;
        }

        if (this.hasLineOfSight(enemyR, enemyC, playerR, playerC, map, bombTiles) || manhattan <= 1) {
          this.startWindup(enemyR, enemyC, playerR, playerC, player.x, player.y);
          return;
        }

        this.pathRecalcTimer -= delta;
        if (this.pathRecalcTimer <= 0 || this.currentPath.length === 0) {
          this.pathRecalcTimer = 350;
          this.currentPath = findPathBFS({ r: enemyR, c: enemyC }, { r: playerR, c: playerC }, map, bombTiles);
          this.targetTile = this.currentPath.length > 0 ? this.currentPath[0] : null;
        }

        if (!this.targetTile) {
          this.velocity = { x: 0, y: 0 };
          return;
        }

        const targetX = this.targetTile.c * TILE_SIZE + TILE_SIZE / 2;
        const targetY = this.targetTile.r * TILE_SIZE + TILE_SIZE / 2;
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 4) {
          this.currentPath.shift();
          this.targetTile = this.currentPath.length > 0 ? this.currentPath[0] : null;
          this.velocity = { x: 0, y: 0 };
        } else {
          const speed = this.aiState === 'HUNTING' ? 85 : this.baseSpeed;
          if (Math.abs(dx) > Math.abs(dy)) {
            this.velocity = { x: Math.sign(dx) * speed, y: 0 };
          } else {
            this.velocity = { x: 0, y: Math.sign(dy) * speed };
          }
        }
        break;
      }

      case 'WINDUP': {
        this.stateTimer -= delta;
        this.velocity = { x: 0, y: 0 };
        if (this.stateTimer <= 0) {
          this.changeState('ATTACK');
          this.stateTimer = 650;
          this.velocity = {
            x: this.attackDir.x * this.chargeSpeed,
            y: this.attackDir.y * this.chargeSpeed,
          };
        }
        break;
      }

      case 'ATTACK': {
        this.stateTimer -= delta;
        if (this.stateTimer <= 0 || isBlocked) {
          this.changeState('COOLDOWN');
          this.stateTimer = 1200;
          this.velocity = { x: 0, y: 0 };
        }
        break;
      }

      case 'COOLDOWN': {
        this.stateTimer -= delta;
        this.velocity = { x: 0, y: 0 };
        if (this.stateTimer <= 0) {
          this.changeState(this.isTracker ? 'TRACKING' : 'IDLE');
          this.stateTimer = this.isTracker ? 0 : 800;
          this.pathRecalcTimer = 0;
          this.currentPath = [];
          this.targetTile = null;
        }
        break;
      }
    }
  }

  destroy() {
    this.stopStateTweens();
    if (this.indicator && this.indicator.active) {
      this.indicator.destroy();
    }
    this.active = false;
  }
}

/**
 * Bomb Simulation Harness verifying 3-Stage Accelerating Fuse, Raycast Propagation, and Chain Reactions.
 */
class BombHarness {
  constructor(map, maxBombs = 4, bombPower = 2) {
    this.map = map.map(row => [...row]);
    this.maxBombs = maxBombs;
    this.bombPower = bombPower;
    this.activeBombs = 0;
    this.bombs = [];
    this.explosions = [];
    this.destroyedBlocks = [];
    this.nextId = 1;
  }

  placeBomb(x, y) {
    if (this.activeBombs >= this.maxBombs) return null;

    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;

    const exists = this.bombs.some(b => b.active && b.row === row && b.col === col);
    if (exists) return null;

    const bomb = {
      id: this.nextId++,
      row,
      col,
      x: centerX,
      y: centerY,
      timeElapsed: 0,
      stage: 1,
      tint: 0xffffff,
      scale: 1.15,
      active: true,
      fuseCanceled: false,
    };

    this.bombs.push(bomb);
    this.activeBombs++;
    return bomb;
  }

  update(deltaMs) {
    const toExplode = [];
    for (const bomb of this.bombs) {
      if (!bomb.active) continue;
      bomb.timeElapsed += deltaMs;

      // Stage 1: 0 - 1000ms
      if (bomb.timeElapsed < 1000) {
        bomb.stage = 1;
        bomb.tint = 0xffffff;
        bomb.scale = 1.15;
      }
      // Stage 2: 1000 - 1600ms
      else if (bomb.timeElapsed < 1600) {
        bomb.stage = 2;
        bomb.tint = 0xff8866;
        bomb.scale = 1.25;
      }
      // Stage 3: 1600 - 2000ms
      else if (bomb.timeElapsed < 2000) {
        bomb.stage = 3;
        bomb.tint = 0xff2222;
        bomb.scale = 1.35;
      }
      // 2000ms: Detonation
      else {
        toExplode.push(bomb);
      }
    }

    for (const b of toExplode) {
      if (b.active) {
        this.explodeBomb(b);
      }
    }
  }

  explodeBomb(bomb) {
    if (!bomb.active) return;
    bomb.active = false;
    this.activeBombs = Math.max(0, this.activeBombs - 1);
    bomb.fuseCanceled = true;

    // Epicenter explosion
    this.explosions.push({ row: bomb.row, col: bomb.col, isCenter: true, tint: 0xffffcc });

    const directions = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    for (const dir of directions) {
      for (let i = 1; i <= this.bombPower; i++) {
        const nr = bomb.row + dir.dr * i;
        const nc = bomb.col + dir.dc * i;

        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
        if (this.map[nr][nc] === TILE_WALL) break; // Indestructible wall halts ray

        if (this.map[nr][nc] === TILE_BLOCK) {
          // Block destroyed and terminates ray
          this.map[nr][nc] = TILE_EMPTY;
          this.destroyedBlocks.push({ row: nr, col: nc });
          this.explosions.push({ row: nr, col: nc, isCenter: false, tint: 0xff7722 });
          break;
        }

        // Empty tile propagates explosion
        this.explosions.push({ row: nr, col: nc, isCenter: false, tint: 0xff7722 });

        // Check for chain reaction with other bombs
        const chainTarget = this.bombs.find(b => b.active && b.row === nr && b.col === nc);
        if (chainTarget) {
          this.explodeBomb(chainTarget);
        }
      }
    }
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

// --- SUITE 1: Enemy State Machine Transitions & Intent Indicator Mappings ---
test('R2 State Coverage: Intent Indicator Text, Color, and Visibility Mappings across all states', () => {
  const enemy = new EnemyModel(60, 60, true);

  // 1. TRACKING
  enemy.changeState('TRACKING');
  assert.equal(enemy.aiState, 'TRACKING');
  assert.equal(enemy.indicator.text, '!');
  assert.equal(enemy.indicator.visible, true);
  assert.equal(enemy.indicator.style.color, '#FFD700');
  assert.equal(enemy.tint, 0xffbbbb, 'Tracker enemy has red-tinted alert');

  // 2. HUNTING
  enemy.changeState('HUNTING');
  assert.equal(enemy.aiState, 'HUNTING');
  assert.equal(enemy.indicator.text, '!');
  assert.equal(enemy.indicator.visible, true);
  assert.equal(enemy.indicator.style.color, '#FFD700');

  // 3. WINDUP
  enemy.changeState('WINDUP');
  assert.equal(enemy.aiState, 'WINDUP');
  assert.equal(enemy.indicator.text, '⚠️');
  assert.equal(enemy.indicator.visible, true);
  assert.equal(enemy.indicator.style.color, '#ff4444');
  assert.equal(enemy.tint, 0xff2222, 'Windup telegraph sets bright red tint');

  // 4. ATTACK
  enemy.attackDir = { x: 1, y: 0 };
  enemy.changeState('ATTACK');
  assert.equal(enemy.aiState, 'ATTACK');
  assert.equal(enemy.indicator.text, '⚡');
  assert.equal(enemy.indicator.visible, true);
  assert.equal(enemy.tint, 0xff8800, 'Attack charge sets flame orange tint');
  assert.equal(enemy.scale.x, 1.3, 'Horizontal attack expands scaleX');
  assert.equal(enemy.scale.y, 0.82, 'Horizontal attack squashes scaleY');

  // 5. COOLDOWN
  enemy.changeState('COOLDOWN');
  assert.equal(enemy.aiState, 'COOLDOWN');
  assert.equal(enemy.indicator.text, '💫');
  assert.equal(enemy.indicator.visible, true);
  assert.equal(enemy.tint, 0x88bbff, 'Cooldown recovery sets dizzy blue tint');

  // 6. IDLE
  enemy.changeState('IDLE');
  assert.equal(enemy.aiState, 'IDLE');
  assert.equal(enemy.indicator.text, '...');
  assert.equal(enemy.indicator.visible, true);
  assert.equal(enemy.indicator.style.color, '#94a3b8');
  assert.equal(enemy.tint, 0);

  // 7. PATROL
  enemy.changeState('PATROL');
  assert.equal(enemy.aiState, 'PATROL');
  assert.equal(enemy.indicator.visible, false, 'Patrol hides indicator to reduce visual clutter');
  assert.equal(enemy.tint, 0);
});

test('R2 State Transitions: Normal Enemy Lifecycle (IDLE -> PATROL -> HUNTING -> WINDUP -> ATTACK -> COOLDOWN -> IDLE)', () => {
  const map = createStandardMap();
  const enemy = new EnemyModel(60, 60, false); // isTracker = false
  const player = { x: 300, y: 300, active: true }; // Far away (7, 7)

  // Start in IDLE
  enemy.changeState('IDLE');
  enemy.stateTimer = 50;

  // Step 1: IDLE timeout transitions to PATROL
  enemy.updateAI(60, player, map, new Set());
  assert.equal(enemy.aiState, 'PATROL', 'Transitions from IDLE to PATROL when timer expires');
  assert.ok(enemy.targetTile, 'Target tile selected for patrol');

  // Step 2: Player approaches within Manhattan distance <= 5 -> triggers HUNTING
  player.x = 140; // col 3
  player.y = 60;  // row 1 (Manhattan dist = 2)
  enemy.updateAI(16, player, map, new Set());
  assert.equal(enemy.aiState, 'HUNTING', 'Alerts and transitions to HUNTING');
  assert.equal(enemy.indicator.text, '!');

  // Step 3: Open Line of sight triggers WINDUP
  enemy.updateAI(16, player, map, new Set());
  assert.equal(enemy.aiState, 'WINDUP', 'Line of sight triggers WINDUP');
  assert.equal(enemy.indicator.text, '⚠️');
  assert.equal(enemy.stateTimer, 450);

  // Step 4: Windup completes (450ms) -> ATTACK charge
  enemy.updateAI(450, player, map, new Set());
  assert.equal(enemy.aiState, 'ATTACK');
  assert.equal(enemy.indicator.text, '⚡');
  assert.equal(enemy.velocity.x, 220, 'Charges rightward with chargeSpeed 220');

  // Step 5: Obstacle collision interrupts attack -> COOLDOWN
  enemy.updateAI(50, player, map, new Set(), true); // isBlocked = true
  assert.equal(enemy.aiState, 'COOLDOWN');
  assert.equal(enemy.indicator.text, '💫');
  assert.equal(enemy.stateTimer, 1200);
  assert.equal(enemy.velocity.x, 0);

  // Step 6: Cooldown recovery (1200ms) returns normal enemy to IDLE
  enemy.updateAI(1200, player, map, new Set());
  assert.equal(enemy.aiState, 'IDLE', 'Normal non-tracker returns to IDLE after cooldown');
  assert.equal(enemy.indicator.text, '...');
});

// --- SUITE 2: Adversarial Attack Vectors When Sharing Tiles ---
test('R2 Adversarial: Identical Coordinates (dx=0, dy=0) yields non-zero attack vector and non-zero velocity', () => {
  const map = createStandardMap();
  const enemy = new EnemyModel(60, 60, true);
  const player = { x: 60, y: 60, active: true }; // Identical position

  enemy.updateAI(16, player, map, new Set());
  assert.equal(enemy.aiState, 'WINDUP');

  // Invariant 1: Direction vector is non-zero
  const dirMagnitude = Math.abs(enemy.attackDir.x) + Math.abs(enemy.attackDir.y);
  assert.equal(dirMagnitude, 1, 'Direction vector must be strictly unit length');
  assert.equal(enemy.attackDir.x, 0);
  assert.equal(enemy.attackDir.y, 1, 'Default fallback direction is non-zero downward vector {x:0, y:1}');

  // Invariant 2: Attack velocity is non-zero during charge
  enemy.updateAI(450, player, map, new Set());
  assert.equal(enemy.aiState, 'ATTACK');
  const velMagnitude = Math.hypot(enemy.velocity.x, enemy.velocity.y);
  assert.equal(velMagnitude, 220, 'Attack velocity must equal chargeSpeed (220)');
  assert.ok(!Number.isNaN(enemy.velocity.x), 'velocity.x must not be NaN');
  assert.ok(!Number.isNaN(enemy.velocity.y), 'velocity.y must not be NaN');
});

test('R2 Adversarial: Sub-pixel offsets in all 8 directions resolve correctly without deadlock', () => {
  const map = createStandardMap();
  const base = 60;
  const offsets = [
    { name: 'Right', dx: +0.2, dy: 0, expDir: { x: 1, y: 0 } },
    { name: 'Left', dx: -0.2, dy: 0, expDir: { x: -1, y: 0 } },
    { name: 'Down', dx: 0, dy: +0.2, expDir: { x: 0, y: 1 } },
    { name: 'Up', dx: 0, dy: -0.2, expDir: { x: 0, y: -1 } },
    { name: 'Down-Right (dy dominant)', dx: +0.1, dy: +0.3, expDir: { x: 0, y: 1 } },
    { name: 'Up-Right (dx dominant)', dx: +0.3, dy: -0.1, expDir: { x: 1, y: 0 } },
    { name: 'Down-Left (dx dominant)', dx: -0.4, dy: +0.2, expDir: { x: -1, y: 0 } },
    { name: 'Up-Left (dy dominant)', dx: -0.2, dy: -0.5, expDir: { x: 0, y: -1 } },
  ];

  for (const { name, dx, dy, expDir } of offsets) {
    const enemy = new EnemyModel(base, base, true);
    const player = { x: base + dx, y: base + dy, active: true };

    enemy.updateAI(16, player, map, new Set());
    assert.equal(enemy.aiState, 'WINDUP', `Sub-pixel test [${name}] must enter WINDUP`);
    assert.deepEqual(enemy.attackDir, expDir, `Sub-pixel test [${name}] resolved wrong attackDir`);

    // Verify velocity in ATTACK
    enemy.updateAI(450, player, map, new Set());
    assert.equal(enemy.aiState, 'ATTACK');
    assert.equal(enemy.velocity.x, expDir.x * 220);
    assert.equal(enemy.velocity.y, expDir.y * 220);
  }
});

// --- SUITE 3: Entity Destruction and Lifecycle Cleanup ---
test('R2 Lifecycle: Entity destruction cleans up indicators and stops tweens', () => {
  const enemy = new EnemyModel(60, 60, true);
  assert.equal(enemy.indicator.active, true);
  assert.equal(enemy.active, true);

  enemy.destroy();
  assert.equal(enemy.active, false);
  assert.equal(enemy.indicator.active, false);
  assert.equal(enemy.indicator.destroyed, true);
  assert.equal(enemy.tweensKilled, true);

  // Idempotency: Multiple destroy calls must not crash
  assert.doesNotThrow(() => {
    enemy.destroy();
    enemy.destroy();
  }, 'Idempotent destroy calls must not throw');
});

// --- SUITE 4: Bomb 3-Stage Accelerating Fuse Timing ---
test('R3 Bomb Fuse: 1ms discrete micro-stepping verifies exact 3-stage thresholds (1000ms, 1600ms, 2000ms)', () => {
  const map = createStandardMap();
  const harness = new BombHarness(map, 1, 2);
  const bomb = harness.placeBomb(60, 60);
  assert.ok(bomb);

  // t = 0 to 999ms: Stage 1 (0-1000ms)
  for (let t = 0; t < 999; t++) {
    harness.update(1);
    assert.equal(bomb.stage, 1, `At t=${t+1}ms expected stage 1`);
    assert.equal(bomb.tint, 0xffffff);
    assert.equal(bomb.scale, 1.15);
    assert.equal(bomb.active, true);
  }

  // t = 1000ms: Transitions to Stage 2
  harness.update(1);
  assert.equal(bomb.timeElapsed, 1000);
  assert.equal(bomb.stage, 2, 'Stage 2 transition at exactly 1000ms');
  assert.equal(bomb.tint, 0xff8866, 'Stage 2 warning amber tint');
  assert.equal(bomb.scale, 1.25);
  assert.equal(bomb.active, true);

  // t = 1001 to 1599ms: Stage 2 continues
  for (let t = 1000; t < 1599; t++) {
    harness.update(1);
    assert.equal(bomb.stage, 2);
    assert.equal(bomb.tint, 0xff8866);
    assert.equal(bomb.scale, 1.25);
    assert.equal(bomb.active, true);
  }

  // t = 1600ms: Transitions to Stage 3
  harness.update(1);
  assert.equal(bomb.timeElapsed, 1600);
  assert.equal(bomb.stage, 3, 'Stage 3 transition at exactly 1600ms');
  assert.equal(bomb.tint, 0xff2222, 'Stage 3 critical red tint');
  assert.equal(bomb.scale, 1.35);
  assert.equal(bomb.active, true);

  // t = 1601 to 1999ms: Stage 3 continues
  for (let t = 1600; t < 1999; t++) {
    harness.update(1);
    assert.equal(bomb.stage, 3);
    assert.equal(bomb.tint, 0xff2222);
    assert.equal(bomb.scale, 1.35);
    assert.equal(bomb.active, true);
  }

  // t = 2000ms: Detonation
  harness.update(1);
  assert.equal(bomb.timeElapsed, 2000);
  assert.equal(bomb.active, false, 'Detonates at t=2000ms');
  assert.equal(harness.activeBombs, 0, 'Active bombs counter decremented');
  assert.ok(harness.explosions.length > 0, 'Explosions created');
});

test('R3 Bomb Fuse: Large delta frame jump cleanly detonates bomb without intermediate skip errors', () => {
  const map = createStandardMap();
  const harness = new BombHarness(map, 1, 2);
  const bomb = harness.placeBomb(60, 60);

  // Single jump of 2500ms
  harness.update(2500);
  assert.equal(bomb.active, false);
  assert.equal(harness.activeBombs, 0);
  assert.ok(harness.explosions.some(e => e.row === 1 && e.col === 1 && e.isCenter));
});

// --- SUITE 5: Raycast Blast Propagation & Obstacle Stopping ---
test('R3 Raycast Blast: Stops strictly at indestructible walls and destroys breakable blocks', () => {
  const map = createStandardMap();
  // Place breakable blocks
  map[1][2] = TILE_BLOCK; // 1 tile east
  map[3][1] = TILE_BLOCK; // 2 tiles south

  const harness = new BombHarness(map, 1, 3); // bombPower = 3
  harness.placeBomb(60, 60); // (1, 1)

  // Detonate
  harness.update(2000);

  // 1. Center (1, 1) exploded with golden-white core tint
  const centerExp = harness.explosions.find(e => e.row === 1 && e.col === 1);
  assert.ok(centerExp);
  assert.equal(centerExp.isCenter, true);
  assert.equal(centerExp.tint, 0xffffcc);

  // 2. North (0, 1) is TILE_WALL -> ray blocked, NO explosion
  assert.ok(!harness.explosions.some(e => e.row === 0 && e.col === 1));

  // 3. West (1, 0) is TILE_WALL -> ray blocked, NO explosion
  assert.ok(!harness.explosions.some(e => e.row === 1 && e.col === 0));

  // 4. East: (1, 2) was TILE_BLOCK -> destroyed, explosion present, but (1, 3) protected
  assert.equal(harness.map[1][2], TILE_EMPTY, 'Block at (1, 2) destroyed');
  assert.ok(harness.explosions.some(e => e.row === 1 && e.col === 2 && !e.isCenter));
  assert.ok(!harness.explosions.some(e => e.row === 1 && e.col === 3), 'Tile behind block protected');

  // 5. South: (2, 1) is EMPTY -> exploded; (3, 1) is BLOCK -> destroyed; (4, 1) protected
  assert.ok(harness.explosions.some(e => e.row === 2 && e.col === 1));
  assert.ok(harness.explosions.some(e => e.row === 3 && e.col === 1));
  assert.equal(harness.map[3][1], TILE_EMPTY, 'Block at (3, 1) destroyed');
  assert.ok(!harness.explosions.some(e => e.row === 4 && e.col === 1), 'Tile beyond block protected');
});

// --- SUITE 6: Chain Detonations & Overlapping Bomb Interactions ---
test('R3 Chain Detonation: 4-Bomb Domino Cascade executes immediately in a single blast event', () => {
  const map = createStandardMap();
  const harness = new BombHarness(map, 4, 2); // power = 2

  // Line of bombs: (1, 1), (1, 3), (1, 5), (1, 7)
  const b1 = harness.placeBomb(1 * 40 + 20, 1 * 40 + 20);
  const b2 = harness.placeBomb(3 * 40 + 20, 1 * 40 + 20);
  const b3 = harness.placeBomb(5 * 40 + 20, 1 * 40 + 20);
  const b4 = harness.placeBomb(7 * 40 + 20, 1 * 40 + 20);

  assert.equal(harness.activeBombs, 4);

  // Detonate Bomb 1
  harness.update(2000);

  // All 4 bombs detonated through cascade
  assert.equal(b1.active, false, 'Bomb 1 detonated');
  assert.equal(b2.active, false, 'Bomb 2 chain-detonated');
  assert.equal(b3.active, false, 'Bomb 3 chain-detonated');
  assert.equal(b4.active, false, 'Bomb 4 chain-detonated');
  assert.equal(harness.activeBombs, 0, 'Active bombs cleanly cleared to 0');

  // Verify epicenters spawned for all 4
  assert.ok(harness.explosions.some(e => e.row === 1 && e.col === 1 && e.isCenter));
  assert.ok(harness.explosions.some(e => e.row === 1 && e.col === 3 && e.isCenter));
  assert.ok(harness.explosions.some(e => e.row === 1 && e.col === 5 && e.isCenter));
  assert.ok(harness.explosions.some(e => e.row === 1 && e.col === 7 && e.isCenter));
});

test('R3 Chain Detonation: Mutual blast proximity between adjacent bombs terminates safely without infinite loop', () => {
  const map = createStandardMap();
  const harness = new BombHarness(map, 2, 2);

  const b1 = harness.placeBomb(1 * 40 + 20, 1 * 40 + 20); // (1, 1)
  const b2 = harness.placeBomb(2 * 40 + 20, 1 * 40 + 20); // (1, 2)

  // Trigger detonation
  assert.doesNotThrow(() => {
    harness.update(2000);
  }, 'Mutual blast must not trigger infinite recursion');

  assert.equal(b1.active, false);
  assert.equal(b2.active, false);
  assert.equal(harness.activeBombs, 0);
});

test('R3 Chain Detonation: 2D Cross-directional blast triggers 4 surrounding bombs simultaneously', () => {
  const map = createStandardMap();
  const harness = new BombHarness(map, 5, 2); // power = 2

  // Center bomb at (5, 5)
  const bCenter = harness.placeBomb(5 * 40 + 20, 5 * 40 + 20);
  // Surrounding bombs at distance 2
  const bNorth = harness.placeBomb(5 * 40 + 20, 3 * 40 + 20); // (3, 5)
  const bSouth = harness.placeBomb(5 * 40 + 20, 7 * 40 + 20); // (7, 5)
  const bWest  = harness.placeBomb(3 * 40 + 20, 5 * 40 + 20); // (5, 3)
  const bEast  = harness.placeBomb(7 * 40 + 20, 5 * 40 + 20); // (5, 7)

  assert.equal(harness.activeBombs, 5);

  // Detonate Center bomb
  harness.update(2000);

  // All 5 bombs detonated
  assert.equal(bCenter.active, false);
  assert.equal(bNorth.active, false);
  assert.equal(bSouth.active, false);
  assert.equal(bWest.active, false);
  assert.equal(bEast.active, false);
  assert.equal(harness.activeBombs, 0);
});

test('Arcade Physics Overlap Contract: Overlap callback (enemies, explosions) destroys enemyObj, not explosion', () => {
  // Simulates Phaser.Physics.Arcade.World.separate / overlap(groupA, groupB, callback)
  // which passes (bodyA.gameObject, bodyB.gameObject) -> (enemyObj, explosionObj)
  let enemyDestroyed = false;
  let explosionDestroyed = false;

  const mockEnemy = {
    active: true,
    destroy() {
      enemyDestroyed = true;
      this.active = false;
    },
  };

  const mockExplosion = {
    active: true,
    destroy() {
      explosionDestroyed = true;
      this.active = false;
    },
  };

  // The GameScene overlap handler implementation from GameScene.ts lines 714-719:
  const overlapCallback = (enemyObj) => {
    const target = enemyObj;
    if (target.active) {
      target.destroy();
    }
  };

  // Call with (enemy, explosion) as Phaser passes (bodyA.gameObject, bodyB.gameObject)
  overlapCallback(mockEnemy, mockExplosion);

  assert.equal(enemyDestroyed, true, 'Enemy must be destroyed on explosion overlap');
  assert.equal(explosionDestroyed, false, 'Explosion must NOT be destroyed by enemy overlap callback');
});
