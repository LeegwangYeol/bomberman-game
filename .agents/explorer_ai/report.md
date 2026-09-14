# Exploration Report: Enemy AI & GameScene Architecture

**Document Type**: Technical Exploration & Architecture Specification  
**Target Target**: `src/game/GameScene.ts`  
**Explorer Role**: Enemy AI & GameScene Architecture Explorer  
**Date**: 2026-09-14  
**Status**: Ready for Implementation  

---

## 1. Executive Summary & Problem Scope

The authoritative request mandates upgrading the Bomberman prototype from primitive graphics and random-walk behaviors to a polished retro-arcade experience featuring:
1. **Real Image Assets** preloaded in Phaser `preload()` for all game entities (player, enemies, bombs, walls, blocks, floor background).
2. **Active Enemy Tracking & Attack AI** replacing the naive random wander with active player-seeking pathfinding and an attack state machine.
3. Clean compilation and zero runtime regressions (`npm run build` exit code 0).

This exploration report provides a comprehensive architectural analysis of the current `src/game/GameScene.ts` enemy mechanics, identifies critical failure modes in the current movement and collision design, and specifies a production-ready **Grid-Based BFS Pathfinding Algorithm** coupled with a **4-Stage Attack State Machine** (Tracking $\rightarrow$ Telegraph/Windup $\rightarrow$ Attack/Charge $\rightarrow$ Cooldown).

---

## 2. Codebase Baseline & Observation in `GameScene.ts`

### 2.1 Grid & Spatial Representation
- **Grid Dimensions**: `ROWS = 13`, `COLS = 15`, `TILE_SIZE = 40` (Lines 3–5).
- **Coordinate Space**: 
  - Arena size: $15 \times 40 = 600\text{px}$ width, $13 \times 40 = 520\text{px}$ height.
  - Centering offset: `offsetX = (800 - 600) / 2 = 100`, `offsetY = (600 - 520) / 2 = 40` (Lines 146–147).
  - Camera scroll: `this.cameras.main.setScroll(-offsetX, -offsetY)` (Line 149).
  - Grid cell $(r, c)$ corresponds to world center:
    $$x = c \times \text{TILE\_SIZE} + \frac{\text{TILE\_SIZE}}{2}, \quad y = r \times \text{TILE\_SIZE} + \frac{\text{TILE\_SIZE}}{2}$$
- **Tile Enumeration**:
  - `TILE_EMPTY = 0` (Line 7)
  - `TILE_WALL = 1` (Line 8) — outer borders (`r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1`) and alternating inner pillars (`r % 2 === 0 && c % 2 === 0`).
  - `TILE_BLOCK = 2` (Line 9) — breakable soft blocks spawned probabilistically (`Math.random() < 0.6`, Line 172).

### 2.2 Current Enemy Spawning (`spawnEnemies`, Lines 123–143)
```typescript
spawnEnemies(count: number) {
  let spawned = 0;
  while (spawned < count) {
    const r = Phaser.Math.Between(5, ROWS - 2);
    const c = Phaser.Math.Between(5, COLS - 2);
    
    if (this.map[r][c] === TILE_EMPTY) {
      const enemy = this.enemies.create(
        c * TILE_SIZE + TILE_SIZE / 2,
        r * TILE_SIZE + TILE_SIZE / 2,
        'enemy'
      ) as Phaser.Physics.Arcade.Sprite;
      
      enemy.setCollideWorldBounds(true);
      enemy.body?.setSize(24, 24);
      enemy.setData('direction', Phaser.Math.Between(0, 3)); // 0:up, 1:right, 2:down, 3:left
      
      spawned++;
    }
  }
}
```

### 2.3 Current Enemy Physics & Collision Setup (`create`, Lines 107–114)
```typescript
this.physics.add.collider(this.enemies, this.walls);
this.physics.add.collider(this.enemies, this.blocks);
this.physics.add.collider(this.enemies, this.bombs);

// Player hits enemy
this.physics.add.overlap(this.player, this.enemies, () => {
  this.playerDie();
});
```

### 2.4 Current Enemy Update Logic (`update`, Lines 210–233)
```typescript
const enemySpeed = 60;
this.enemies.getChildren().forEach((child: any) => {
  const enemy = child as Phaser.Physics.Arcade.Sprite;
  if (!enemy.active) return true;

  const dir = enemy.getData('direction');
  
  // Check if blocked
  if (enemy.body && (enemy.body.blocked.up || enemy.body.blocked.down || enemy.body.blocked.left || enemy.body.blocked.right)) {
    // Change direction if hit wall
    enemy.setData('direction', Phaser.Math.Between(0, 3));
  }

  enemy.setVelocity(0);
  switch(dir) {
    case 0: enemy.setVelocityY(-enemySpeed); break; // up
    case 1: enemy.setVelocityX(enemySpeed); break;  // right
    case 2: enemy.setVelocityY(enemySpeed); break;  // down
    case 3: enemy.setVelocityX(-enemySpeed); break; // left
  }
  return true;
});
```

---

## 3. Critical Flaws & Failure Modes in Current Enemy Implementation

1. **Zero Tactical Awareness / Pure Random Wander**:
   The enemy chooses a random direction when its Arcade body is blocked. It has zero knowledge of `this.player.x` or `this.player.y`, posing almost zero threat unless the player accidentally walks into them.
2. **Missing Attack Execution (Requirement R2 Violation)**:
   The enemy never attacks. It only applies static contact damage via an overlap check. There is no charge, lunge, projectile, or attack telegraph.
3. **Corner Snagging & Corridor Sticking in Arcade Physics**:
   Because enemies move continuously with `setVelocityX/Y` without tile-center snapping, when an enemy tries to turn into a 1-tile corridor while misaligned by even 2–4 pixels, Arcade physics collision stops it from entering. The enemy gets stuck jittering against the corner indefinitely.
4. **No Awareness of Active Bombs & Blast Traps**:
   Enemies collide with bombs (`collider(this.enemies, this.bombs)`), but do not detect ticking bombs or attempt to avoid blast lines.
5. **Absence of Delta Time (`time, delta`)**:
   `update()` does not take `(time: number, delta: number)`, making state durations, telegraph timers, and cooldowns impossible to manage accurately without external time tracking.

---

## 4. Advanced Tracking AI Architecture

### 4.1 Grid Representation & Obstacle Modeling
The grid is $13 \times 15 = 195$ cells. This small search space makes **Breadth-First Search (BFS)** computationally trivial ($<0.05\text{ms}$ per invocation in JavaScript V8), guaranteeing the mathematically optimal shortest path with zero heuristic tuning needed.

A tile $(r, c)$ is classified as an obstacle if:
1. `r < 0 || r >= ROWS || c < 0 || c >= COLS` (out of map bounds)
2. `map[r][c] === TILE_WALL` (outer border or fixed pillar)
3. `map[r][c] === TILE_BLOCK` (breakable soft block, unless enemy has phase ability)
4. Active bomb exists at $(r, c)$ (queried from active bombs group)

### 4.2 Breadth-First Search (BFS) Algorithm with Fallback Heuristic
When the player is isolated behind soft blocks, an open path between enemy and player may not exist. If BFS simply fails, the enemy would freeze in place. 

**Solution**: During BFS traversal, track the visited open tile that minimizes Manhattan distance to the player. If the target tile cannot be reached, return the path to this closest reachable frontier tile! This ensures enemies aggressively close the gap and pressure the player's perimeter.

```typescript
export interface GridCoord {
  r: number;
  c: number;
}

export function findPathBFS(
  start: GridCoord,
  target: GridCoord,
  map: number[][],
  bombTiles: Set<string>
): GridCoord[] {
  if (start.r === target.r && start.c === target.c) return [];

  const queue: GridCoord[] = [start];
  const visited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const parent: Map<string, GridCoord | null> = new Map();

  visited[start.r][start.c] = true;
  parent.set(`${start.r},${start.c}`, null);

  const directions = [
    { dr: -1, dc: 0 }, // Up
    { dr: 1, dc: 0 },  // Down
    { dr: 0, dc: -1 }, // Left
    { dr: 0, dc: 1 },  // Right
  ];

  let closestReachable: GridCoord = start;
  let minDistance = Math.abs(start.r - target.r) + Math.abs(start.c - target.c);
  let reachedTarget = false;

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.r === target.r && current.c === target.c) {
      reachedTarget = true;
      break;
    }

    const dist = Math.abs(current.r - target.r) + Math.abs(current.c - target.c);
    if (dist < minDistance) {
      minDistance = dist;
      closestReachable = current;
    }

    for (const dir of directions) {
      const nr = current.r + dir.dr;
      const nc = current.c + dir.dc;

      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (visited[nr][nc]) continue;

      // Check impassability: Wall or Block
      if (map[nr][nc] === TILE_WALL || map[nr][nc] === TILE_BLOCK) {
        continue;
      }

      // Check bomb obstacle (unless target is player tile)
      if (bombTiles.has(`${nr},${nc}`) && !(nr === target.r && nc === target.c)) {
        continue;
      }

      visited[nr][nc] = true;
      parent.set(`${nr},${nc}`, current);
      queue.push({ r: nr, c: nc });
    }
  }

  const destination = reachedTarget ? target : closestReachable;
  if (destination.r === start.r && destination.c === start.c) {
    return [];
  }

  // Reconstruct path from destination backwards to start
  const path: GridCoord[] = [];
  let curr: GridCoord | null = destination;
  while (curr && !(curr.r === start.r && curr.c === start.c)) {
    path.unshift(curr);
    curr = parent.get(`${curr.r},${curr.c}`) || null;
  }

  return path;
}
```

### 4.3 Waypoint Navigation & Tile-Center Snapping
To completely prevent Arcade physics corner-clipping:
1. When moving towards the next tile in the path:
   $$targetX = nextTile.c \times \text{TILE\_SIZE} + \frac{\text{TILE\_SIZE}}{2}$$
   $$targetY = nextTile.r \times \text{TILE\_SIZE} + \frac{\text{TILE\_SIZE}}{2}$$
2. The enemy adjusts its velocity towards $(targetX, targetY)$.
3. On the perpendicular axis, if the enemy is slightly misaligned ($|\text{offset}| > 2\text{px}$), apply corrective velocity to snap into the corridor center before accelerating forward.
4. When within an arrival threshold ($|\Delta x| < 4\text{px} \land |\Delta y| < 4\text{px}$), the enemy has reached the tile waypoint and advances to the next step.

---

## 5. Attack State Machine Architecture

### 5.1 State Machine Specification
The enemy AI operates under a robust 4-stage Finite State Machine (FSM):

```
       ┌───────────────────────────────┐
       │                               │
       ▼                               │
┌──────────────┐   Line of Sight /     │
│   TRACKING   │   Proximity Trigger   │
│  (Pathfind)  ├───────────────────────┤
└──────┬───────┘                       │
       │ Trigger Met                   │
       ▼                               │
┌──────────────┐                       │
│ WINDUP/WARN  │ (400ms Telegraph,     │
│  (Telegraph) │  Red Flash, Stop)     │
└──────┬───────┘                       │
       │ Windup Complete               │
       ▼                               │
┌──────────────┐                       │
│ ATTACK/DASH  │ (High Speed Dash,     │
│   (Execute)  │  Crush/Damage Player) │
└──────┬───────┘                       │
       │ Wall Hit / Timer Expired      │
       ▼                               │
┌──────────────┐                       │
│   COOLDOWN   │ (1200ms Vulnerable,   │
│  (Recovery)  ├───────────────────────┘
└──────────────┘  Pale Tint, Stun)
```

### 5.2 State Definitions & Mechanics

#### 1. `TRACKING` (Seeking Player)
- **Behavior**: Periodically (every 300ms–500ms or on waypoint arrival) calculates BFS path to the player's current grid position.
- **Speed**: $75\text{ px/s}$ (approx. 50% of player speed, allowing skillful player evasion).
- **Trigger Check 1 (Line of Sight Charge)**:
  - If enemy and player are in the same row ($r_E = r_P$) or column ($c_E = c_P$), and distance $\le 6$ tiles.
  - Perform raycast: all tiles between them must be free of `TILE_WALL`, `TILE_BLOCK`, and active bombs.
  - If clear LOS exists $\rightarrow$ enter `WINDUP`.
- **Trigger Check 2 (Proximity Lunge)**:
  - If Manhattan distance $\le 1.5$ tiles $\rightarrow$ enter `WINDUP`.

#### 2. `WINDUP` / `TELEGRAPH` (Fairness & Telegraphing)
- **Duration**: 400ms – 500ms.
- **Behavior**: Completely stops velocity (`setVelocity(0, 0)`).
- **Visual Feedback**:
  - Sets visual alert tint: `enemy.setTint(0xff3333)` (flashing bright red).
  - Emits a small scale bounce or exclamation mark.
  - Locks attack direction vector:
    $$dirX = \text{Math.sign}(player.x - enemy.x), \quad dirY = \text{Math.sign}(player.y - enemy.y)$$
- **Player Counter-play**: Player sees the windup and has $0.5\text{s}$ to step into a side corridor or plant a bomb directly in the attack trajectory!

#### 3. `ATTACK` / `CHARGE` (Executing the Attack)
- **Duration**: Up to 650ms max, or until obstacle impact.
- **Speed**: $200\text{ px/s}$ (133% of player speed, delivering a terrifying burst of speed).
- **Collision Rules**:
  - Overlap with player triggers immediate `playerDie()`.
  - Collision with `TILE_WALL` or `TILE_BLOCK` or bomb triggers immediate transition to `COOLDOWN`.
  - Emits camera shake (intensity 0.005, 80ms) on wall impact.

#### 4. `COOLDOWN` / `RECOVERY` (Tactical Player Window)
- **Duration**: 1200ms.
- **Behavior**: Velocity reduced to 0 or sluggish crawl ($20\text{ px/s}$).
- **Visual Feedback**:
  - Tinted cool blue/gray (`0x88bbff` or `0xaaaaaa`) representing exhaustion/dizziness.
- **Tactical Window**: This is the prime opportunity for the player to drop a bomb next to the vulnerable enemy.
- **Exit Condition**: After 1200ms, restores standard tint (`clearTint()`) and returns to `TRACKING`.

---

## 6. Complete Implementation Architecture

### 6.1 Modular Enemy Class Design (`src/game/Enemy.ts`)
To keep `GameScene.ts` clean and maintainable, the Enemy can be encapsulated as a dedicated class extending `Phaser.Physics.Arcade.Sprite`:

```typescript
import Phaser from 'phaser';
import { TILE_SIZE, ROWS, COLS, TILE_WALL, TILE_BLOCK, findPathBFS, GridCoord } from './GameScene';

export enum EnemyState {
  TRACKING = 'TRACKING',
  WINDUP = 'WINDUP',
  ATTACKING = 'ATTACKING',
  COOLDOWN = 'COOLDOWN',
}

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public aiState: EnemyState = EnemyState.TRACKING;
  
  private stateTimer: number = 0;
  private pathRecalcTimer: number = 0;
  private currentPath: GridCoord[] = [];
  private targetTile: GridCoord | null = null;
  
  private attackDir: { x: number; y: number } = { x: 0, y: 0 };
  private baseSpeed: number = 75;
  private chargeSpeed: number = 200;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string = 'enemy') {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.body?.setSize(26, 26);
  }

  public updateAI(
    time: number,
    delta: number,
    player: Phaser.Physics.Arcade.Sprite,
    map: number[][],
    bombTiles: Set<string>
  ) {
    if (!this.active || !player.active) {
      this.setVelocity(0, 0);
      return;
    }

    const enemyR = Math.floor(this.y / TILE_SIZE);
    const enemyC = Math.floor(this.x / TILE_SIZE);
    const playerR = Math.floor(player.y / TILE_SIZE);
    const playerC = Math.floor(player.x / TILE_SIZE);

    switch (this.aiState) {
      case EnemyState.TRACKING:
        this.handleTracking(delta, enemyR, enemyC, playerR, playerC, player, map, bombTiles);
        break;

      case EnemyState.WINDUP:
        this.handleWindup(delta);
        break;

      case EnemyState.ATTACKING:
        this.handleAttacking(delta);
        break;

      case EnemyState.COOLDOWN:
        this.handleCooldown(delta);
        break;
    }
  }

  private handleTracking(
    delta: number,
    er: number,
    ec: number,
    pr: number,
    pc: number,
    player: Phaser.Physics.Arcade.Sprite,
    map: number[][],
    bombTiles: Set<string>
  ) {
    // Check Line-of-Sight Attack Condition
    if (this.hasLineOfSight(er, ec, pr, pc, map, bombTiles)) {
      this.startWindup(er, ec, pr, pc, player);
      return;
    }

    // Recalculate Path
    this.pathRecalcTimer -= delta;
    if (this.pathRecalcTimer <= 0 || this.currentPath.length === 0) {
      this.pathRecalcTimer = 400; // Recalculate every 400ms
      this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);
      this.targetTile = this.currentPath.length > 0 ? this.currentPath[0] : null;
    }

    // Waypoint Navigation
    if (!this.targetTile) {
      // No reachable path, pause briefly
      this.setVelocity(0, 0);
      return;
    }

    const targetX = this.targetTile.c * TILE_SIZE + TILE_SIZE / 2;
    const targetY = this.targetTile.r * TILE_SIZE + TILE_SIZE / 2;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 4) {
      // Waypoint arrived, advance to next
      this.currentPath.shift();
      this.targetTile = this.currentPath.length > 0 ? this.currentPath[0] : null;
      this.setVelocity(0, 0);
    } else {
      // Step towards waypoint
      const vx = (dx / dist) * this.baseSpeed;
      const vy = (dy / dist) * this.baseSpeed;
      this.setVelocity(vx, vy);

      // Flip sprite based on movement direction
      if (Math.abs(vx) > 5) {
        this.setFlipX(vx < 0);
      }
    }
  }

  private hasLineOfSight(
    er: number,
    ec: number,
    pr: number,
    pc: number,
    map: number[][],
    bombTiles: Set<string>
  ): boolean {
    const maxRange = 6;
    if (er === pr) {
      const dist = Math.abs(ec - pc);
      if (dist === 0 || dist > maxRange) return false;
      const step = Math.sign(pc - ec);
      for (let c = ec + step; c !== pc; c += step) {
        if (map[er][c] !== 0 || bombTiles.has(`${er},${c}`)) return false;
      }
      return true;
    } else if (ec === pc) {
      const dist = Math.abs(er - pr);
      if (dist === 0 || dist > maxRange) return false;
      const step = Math.sign(pr - er);
      for (let r = er + step; r !== pr; r += step) {
        if (map[r][ec] !== 0 || bombTiles.has(`${r},${ec}`)) return false;
      }
      return true;
    }
    return false;
  }

  private startWindup(er: number, ec: number, pr: number, pc: number, player: Phaser.Physics.Arcade.Sprite) {
    this.aiState = EnemyState.WINDUP;
    this.stateTimer = 450; // 450ms telegraph
    this.setVelocity(0, 0);
    this.setTint(0xff2222); // Red warning tint

    // Lock attack direction
    if (er === pr) {
      this.attackDir = { x: Math.sign(pc - ec), y: 0 };
    } else {
      this.attackDir = { x: 0, y: Math.sign(pr - er) };
    }
  }

  private handleWindup(delta: number) {
    this.stateTimer -= delta;
    this.setVelocity(0, 0);

    if (this.stateTimer <= 0) {
      // Launch charge attack!
      this.aiState = EnemyState.ATTACKING;
      this.stateTimer = 650; // Max charge duration
      this.setTint(0xffaa00); // Orange charging tint
      this.setVelocity(
        this.attackDir.x * this.chargeSpeed,
        this.attackDir.y * this.chargeSpeed
      );
    }
  }

  private handleAttacking(delta: number) {
    this.stateTimer -= delta;

    // Check if collided with wall or block
    const isBlocked = this.body && (
      (this.attackDir.x > 0 && this.body.blocked.right) ||
      (this.attackDir.x < 0 && this.body.blocked.left) ||
      (this.attackDir.y > 0 && this.body.blocked.down) ||
      (this.attackDir.y < 0 && this.body.blocked.up)
    );

    if (this.stateTimer <= 0 || isBlocked) {
      // Enter cooldown
      this.aiState = EnemyState.COOLDOWN;
      this.stateTimer = 1200; // 1200ms recovery window
      this.setVelocity(0, 0);
      this.setTint(0x88bbff); // Exhausted blue tint
      this.scene.cameras.main.shake(80, 0.005);
    }
  }

  private handleCooldown(delta: number) {
    this.stateTimer -= delta;
    this.setVelocity(0, 0);

    if (this.stateTimer <= 0) {
      // Cooldown finished, resume tracking
      this.aiState = EnemyState.TRACKING;
      this.clearTint();
      this.pathRecalcTimer = 0; // Force immediate path recalculation
    }
  }
}
```

### 6.2 Integration into `GameScene.ts`
1. **In `preload()`**:
   - Preload real asset PNGs: `this.load.image('player', '/assets/player.png')`, `this.load.image('enemy', '/assets/enemy.png')`, etc.
   - Keep procedural graphics generation as a resilient fallback if images fail to load.
2. **In `create()`**:
   - Replace generic sprite creation in `this.enemies` with the new `Enemy` instances:
     ```typescript
     const enemy = new Enemy(this, c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 'enemy');
     this.enemies.add(enemy);
     ```
3. **In `update(time: number, delta: number)`**:
   - Collect active bomb tiles:
     ```typescript
     const bombTiles = new Set<string>();
     this.bombs.getChildren().forEach((b: any) => {
       const col = Math.floor(b.x / TILE_SIZE);
       const row = Math.floor(b.y / TILE_SIZE);
       bombTiles.add(`${row},${col}`);
     });
     ```
   - Delegate update to each active enemy:
     ```typescript
     this.enemies.getChildren().forEach((child: any) => {
       const enemy = child as Enemy;
       if (enemy.active) {
         enemy.updateAI(time, delta, this.player, this.map, bombTiles);
       }
     });
     ```
4. **In `playerDie()`**:
   - When player dies, pause enemy AI and reset active states.

---

## 7. Verification & Audit Matrix

| Verification Aspect | Method / Test Case | Success Criteria |
|---|---|---|
| **Compilation** | `npm run build` | Exits with code 0 without any type or linter errors |
| **Active Tracking** | Place player in open corridor | Enemy follows BFS path step-by-step to close distance |
| **Obstacle Avoidance** | Place breakable blocks and inner walls | Enemy pathfinder routes around obstacles without clipping |
| **Bomb Hazard Avoidance** | Place a bomb between enemy and player | Enemy recognizes bomb tile as solid, pathfinding around it |
| **Attack Telegraph** | Align player with enemy line-of-sight | Enemy pauses, turns bright red (WINDUP 450ms) before dash |
| **Charge Attack Execution**| Observe enemy post-windup | Enemy dashes at 200 px/s along corridor toward player |
| **Cooldown Vulnerability** | Evade dash or let enemy impact wall | Enemy halts for 1200ms with blue tint, open to bomb trap |
| **Player Collision** | Enemy impacts player during tracking or attack | Triggers `playerDie()` cleanly |

---

## 8. Summary of Deliverables
- Detailed analysis of existing `GameScene.ts` mechanics.
- BFS grid search algorithm specification with closest-reachable fallback.
- 4-stage Attack State Machine specification (`TRACKING` $\rightarrow$ `WINDUP` $\rightarrow$ `ATTACK` $\rightarrow$ `COOLDOWN`).
- Standalone TypeScript architecture blueprint ready for implementation workers.
- Zero-regression test plan verifying clean build and game integrity.
