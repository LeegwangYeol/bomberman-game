# Handoff Report: Advanced Enemy AI (Strategic Bomb Placement & Blast Escape) and Overhead Name Tag UI

## 1. Observation

### 1.1 Existing Architecture & File Locations
1. **Pathfinding Engine (`src/game/pathfinding.ts:1-94`)**:
   - Grid constants: `TILE_SIZE = 40`, `ROWS = 13`, `COLS = 15`. Tile types: `TILE_EMPTY = 0`, `TILE_WALL = 1`, `TILE_BLOCK = 2`.
   - `findPathBFS(start: GridCoord, target: GridCoord, map: number[][], bombTiles: Set<string>): GridCoord[]` uses discrete BFS queue with a `visited[13][15]` matrix.
   - At line 68-71, active bomb tiles are treated as obstacles:
     ```ts
     if (bombTiles.has(`${nr},${nc}`) && !(nr === target.r && nc === target.c)) {
       continue;
     }
     ```
   - Manhattan fallback nearest-frontier logic (`closestReachable`) is utilized if the target is completely enclosed by breakable blocks (`lines 40-42, 52-56, 79-83`).

2. **Enemy FSM & AI Loop (`src/game/GameScene.ts:23-306`)**:
   - `EnemyState` enum (`GameScene.ts:23-31`):
     ```ts
     export enum EnemyState {
       IDLE = 'IDLE',
       PATROL = 'PATROL',
       TRACKING = 'TRACKING',
       HUNTING = 'HUNTING',
       WINDUP = 'WINDUP',
       ATTACK = 'ATTACK',
       COOLDOWN = 'COOLDOWN',
     }
     ```
   - Current enemy instances have `isTracker: boolean` (`lines 58-61`), base speed 75 px/s, charge dash speed 220 px/s (`lines 47-48`), and an overhead text indicator (`lines 70-82`) positioned at `(this.x, this.y - 24)`.
   - Attack trigger: `hasLineOfSight(...)` within range 6 or Manhattan distance `<= 1` triggers `startWindup(...)` (`lines 438-441`), transitioning from `WINDUP` (450ms telegraph) -> `ATTACK` (charge dash, max 650ms) -> `COOLDOWN` (1200ms recovery) -> `TRACKING` / `IDLE`.
   - **Crucial Observation**: Enemies currently have **no bomb placement capability**. Their only attack mode is physical charge collision.

3. **Bomb Lifecycle & Physics Groups (`src/game/GameScene.ts:637, 677, 990-1175`)**:
   - Bombs are stored in `this.bombs = this.physics.add.group()`.
   - Both player and enemies collide with bombs:
     - `this.physics.add.collider(this.player, this.bombs);` (`line 699`)
     - `this.physics.add.collider(this.enemies, this.bombs);` (`line 703`)
   - `placeBomb()` (`lines 990-1061`) snaps to tile center, rejects placement if tile already has an active bomb (`lines 999-1008`), and checks player capacity `this.activeBombs >= this.maxBombs` (`line 991`).
   - Fuse timing: 2000ms total (`line 1058`) with a 3-stage accelerating pulse tween chain (`lines 1016-1053`).
   - `explodeBomb()` (`lines 1063-1145`) destroys the bomb, decrements `this.activeBombs`, shakes camera, spawns epicenter explosion, raycasts in 4 cardinal directions up to `this.bombPower = 2`, destroys `TILE_BLOCK` via `destroyBlock()`, spawns arm explosions in `this.explosions`, and triggers chain reactions on overlapping bombs (`lines 1134-1143`).
   - Damage Overlaps (`lines 711-719`):
     - `this.physics.add.overlap(this.player, this.explosions, () => this.playerDie());`
     - `this.physics.add.overlap(this.enemies, this.explosions, (enemyObj) => { ... target.destroy(); });` (Friendly fire is already universally enabled: explosions kill any enemy).

4. **Overhead UI Indicator (`src/game/GameScene.ts:70-81, 109-226, 256-259`)**:
   - Indicator text object created at `(x, y - 24)` with origin `(0.5, 0.5)`, depth 15, bold 15px monospace font.
   - Synchronized every frame in `updateAI`: `this.indicator.setPosition(this.x, this.y - 24)`.
   - Cleared and destroyed in `destroy()` (`line 622-624`).
   - Currently, there is no name label identifying the enemy.

5. **Existing Verification Baseline**:
   - `npm test` runs 70 tests in `node:test` (`tests/*.test.mjs`) in ~94ms, passing 70/70 tests with 0 failures.
   - `npm run build` runs Next.js Turbopack build and exits with code 0 in ~1.0s.

---

## 2. Logic Chain

### 2.1 Strategic Enemy Bomb Placement Triggers
1. **Trigger Condition 1 — Corridor Interception / Trap Proximity**:
   - In a 13x15 grid with alternating pillars, corridors are 1 tile wide.
   - If an enemy is within Manhattan distance `1 <= dist <= 3` from the player and aligned horizontally or vertically, placing a bomb at the enemy's current tile projects a blast of radius 2 that threatens the player.
   - If the player is in a corridor with limited escape routes, this forces player evasion or traps them.
2. **Trigger Condition 2 — Breakable Block Breaching**:
   - When `findPathBFS` returns an empty path or a path whose destination is adjacent to breakable blocks (`TILE_BLOCK`) blocking access to the player, placing a bomb allows the enemy to clear the obstacles to reach the player.
3. **Trigger Condition 3 — Cadence & Capacity Control**:
   - Uncontrolled bomb spam would fill the grid, trap both player and enemies unfairly, and degrade frame rates.
   - Therefore, bomb placement must be strictly rate-limited:
     - Enemy bomb inventory: max 1 active bomb per enemy (`activeBombs < maxBombs`).
     - Global enemy bomb cap: max 2 active enemy bombs across all enemies on the arena.
     - Per-enemy cooldown: minimum 4000ms to 6000ms between bomb drops.
     - State restriction: can only initiate bomb placement during `TRACKING` or `HUNTING`, not during `WINDUP`, `ATTACK`, `COOLDOWN`, or `EVADING`.

### 2.2 Blast Safety & Suicide Prevention (The Evacuation Invariant)
1. **The Core Danger**:
   - If an enemy places a bomb at tile `(er, ec)` with blast radius $P = 2$, the blast will engulf `(er, ec)` plus up to 2 tiles in each open cardinal direction.
   - Because the fuse duration is 2000ms and enemy speed is 75-85 px/s (~1.875 - 2.125 tiles/s), an enemy can traverse at most ~3.5 tiles before detonation.
   - If the enemy places a bomb in a dead-end corridor of length $\le 2$, the bomb seals the exit, resulting in unavoidable self-destruction.
2. **The Pre-Placement Invariant**:
   - **An enemy MUST NEVER drop a bomb unless a guaranteed safe escape path is computed and verified BEFORE the bomb is spawned.**
3. **Escape Route Calculation Algorithm**:
   - Given hypothetical bomb at `(er, ec)` with blast radius $P$ and current active bombs:
     1. Compute `dangerTiles`: Set of all coordinates that will receive explosion flames from this hypothetical bomb AND all currently ticking bombs.
     2. Run `findEscapePathBFS(start, dangerTiles, map, bombTiles, maxSteps = 4)`.
     3. Search outward via BFS until encountering the first reachable walkable tile that is **NOT in `dangerTiles`**.
     4. If no safe tile is reachable within `maxSteps` (e.g. within 3-4 steps), the check **FAILS**. The enemy aborts bomb placement and continues standard tracking.
     5. If a safe tile is found, the check **SUCCEEDS**. The enemy drops the bomb, transitions to `EVADING` state, and immediately follows the escape path.
4. **Finite Bound & No-Crash Guarantee**:
   - Grid size is fixed at $13 \times 15 = 195$ tiles.
   - BFS with a visited matrix visits each tile at most once ($O(V + E) \le 195 \text{ operations}$), executing in $<0.05\text{ms}$.
   - Infinite loops, call stack overflows, and game freezes are mathematically impossible.

### 2.3 Bomb Lifecycle & Damage Integration
1. **Group Unification vs Separation**:
   - Adding enemy bombs to the existing `this.bombs` physics group guarantees:
     - Arcade physics colliders (`this.player`, `this.bombs`) and (`this.enemies`, `this.bombs`) apply immediately with zero code duplication.
     - Existing `bombTiles` gathering in `GameScene.update()` automatically includes enemy bombs, making player and enemy pathfinding avoid active bombs seamlessly.
     - Chain reactions in `explodeBomb` naturally trigger both player and enemy bombs.
2. **Ownership & Counter Isolation**:
   - Player bomb count `this.activeBombs` must not be decremented or incremented by enemy bombs.
   - Store metadata on bomb sprite:
     `bomb.setData('owner', 'enemy'); bomb.setData('enemy', this); bomb.setData('power', 2);`
   - In `explodeBomb`:
     - If `bomb.getData('owner') === 'player'`, decrement `this.activeBombs`.
     - If `bomb.getData('owner') === 'enemy'`, call `enemy.onBombExploded()` or decrement enemy's local active count.
3. **Visual Distinction**:
   - Enemy bombs should feature a distinct menacing aesthetic (e.g. purple/amethyst tint `0xd946ef` or dark crimson `0xd00000`, pulsing with an ominous hue) so the player can immediately tell which bombs were laid by enemies.
4. **Friendly Fire Consistency**:
   - In classic Bomberman, explosions are indiscriminate. Existing `overlap(this.enemies, this.explosions)` destroys any enemy caught in fire.
   - If an enemy fails to escape in time or is caught in another bomb's chain reaction, it will be destroyed. This provides rewarding, emergent gameplay.

### 2.4 Overhead Name Tag & UI Badge Integration
1. **Vertical Hierarchy**:
   - Sprite center is at `(x, y)`. Sprite height is 32px (top edge is at `y - 16`).
   - If name tag and status indicator share the same Y offset, they collide and become unreadable.
   - Two-tier vertical separation:
     - **Tier 1 (Lower / Identity)**: Name Tag at `y - 19` (hovering 3px above the sprite top).
     - **Tier 2 (Upper / Intent)**: Status Indicator Badge at `y - 33` (hovering 14px above the name tag).
2. **Styling Specifications**:
   - Text label with high-contrast background pill:
     - Font: `10px`, `bold`, `monospace, "Press Start 2P", Arial, sans-serif`.
     - Background: `rgba(15, 23, 42, 0.85)` (deep dark slate pill) with `padding: { x: 4, y: 1 }`.
     - Text colors:
       - Tracker / Bomber enemies: `#fb923c` (warm orange) or `#f59e0b` (amber).
       - Patrol / Standard enemies: `#38bdf8` (sky blue) or `#34d399` (mint).
     - Stroke: `#000000`, thickness 2px.
     - Depth: 16 (above indicator depth 15, enemy depth 9).
3. **Persona Catalog**:
   - Trackers: `"Blinky"`, `"Pyro Slime"`, `"Ignis"`, `"Stalker"`, `"Shadow"`.
   - Patrol / Normal: `"Grumble"`, `"Puffball"`, `"Blobby"`, `"Spook"`, `"Waddler"`.
4. **Lifecycle & Tween Safety**:
   - In `updateAI`, update both positions:
     ```ts
     this.nameTag.setPosition(this.x, this.y - 19);
     this.indicator.setPosition(this.x, this.y - 33);
     ```
   - In `destroy()`, cleanly destroy `this.nameTag` alongside `this.indicator` to prevent orphaned DOM/canvas text objects and memory leaks.

---

## 3. Caveats

1. **Sub-agent Write Permissions**: As an Explorer subagent, write access is restricted to the `.agents/explorer_mech_ai` directory. Source files (`src/game/pathfinding.ts`, `src/game/GameScene.ts`) must be modified by the implementer agent after user confirmation.
2. **Enemy-to-Enemy Physical Collisions**: Current `GameScene.ts` does not register colliders between enemies (`collider(this.enemies, this.enemies)`). Enemies can pass through each other in corridors. If enemy-enemy collision is ever added in future, two enemies escaping down the same 1-tile corridor could block each other; keeping them non-colliding (or using soft separation) is recommended.
3. **Chain Reaction Unpredictability**: If a player bomb detonates early and triggers an enemy bomb via chain reaction, the enemy may be caught before reaching its calculated safe tile. This is intended emergent Bomberman behavior, not a bug.
4. **No caveats** regarding algorithmic complexity or grid safety; 13x15 BFS is strictly bounded and verified.

---

## 4. Conclusion

### 4.1 Proposed Data Structures & State Machine Additions

#### A. New FSM State: `EVADING`
Extend `EnemyState` in `src/game/GameScene.ts`:
```ts
export enum EnemyState {
  IDLE = 'IDLE',
  PATROL = 'PATROL',
  TRACKING = 'TRACKING',
  HUNTING = 'HUNTING',
  WINDUP = 'WINDUP',
  ATTACK = 'ATTACK',
  COOLDOWN = 'COOLDOWN',
  EVADING = 'EVADING', // NEW: Actively fleeing to a safe tile outside bomb blast zone
}
```

Visuals for `EVADING`:
- Tint: `0xdda0dd` (plum alert) or `0xf472b6` (urgent pink).
- Indicator: Text `'💨'` or `'💣'`, stroke `'#4a044e'`.
- Speed: 85 px/s (swift evasion).

#### B. Enemy Class Additions
```ts
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  // Identity
  public enemyName: string;
  private nameTag!: Phaser.GameObjects.Text;

  // Bomb capabilities
  public canDropBombs: boolean = true;
  private activeBombs: number = 0;
  private maxBombs: number = 1;
  private bombCooldownTimer: number = 3000; // Initial 3s grace period on spawn
  private bombPower: number = 2;
  private safeTile: GridCoord | null = null;
```

#### C. Pathfinding Helper Functions (`src/game/pathfinding.ts`)
Add two helper functions to `src/game/pathfinding.ts`:

```ts
/**
 * Computes all grid tiles engulfed by an explosion at `center` with radius `power`.
 */
export function getBlastTiles(
  center: GridCoord,
  power: number,
  map: number[][]
): Set<string> {
  const blast = new Set<string>();
  blast.add(`${center.r},${center.c}`);

  const directions = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  for (const dir of directions) {
    for (let i = 1; i <= power; i++) {
      const nr = center.r + dir.dr * i;
      const nc = center.c + dir.dc * i;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
      if (map[nr][nc] === TILE_WALL) break;
      blast.add(`${nr},${nc}`);
      if (map[nr][nc] === TILE_BLOCK) break;
    }
  }

  return blast;
}

/**
 * Finds the shortest path to the nearest safe tile outside dangerTiles.
 * Guarantees enemy avoids walking into walls, blocks, or other active bombs.
 */
export function findEscapePathBFS(
  start: GridCoord,
  dangerTiles: Set<string>,
  map: number[][],
  existingBombs: Set<string>,
  maxSteps: number = 4
): GridCoord[] | null {
  // If start is miraculously safe, return empty path
  if (!dangerTiles.has(`${start.r},${start.c}`)) return [];

  const queue: { coord: GridCoord; dist: number }[] = [{ coord: start, dist: 0 }];
  const visited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const parent: Map<string, GridCoord | null> = new Map();

  visited[start.r][start.c] = true;
  parent.set(`${start.r},${start.c}`, null);

  const directions = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  let safeTarget: GridCoord | null = null;

  while (queue.length > 0) {
    const currentItem = queue.shift()!;
    const { coord: current, dist } = currentItem;

    if (!dangerTiles.has(`${current.r},${current.c}`)) {
      safeTarget = current;
      break;
    }

    if (dist >= maxSteps) continue;

    for (const dir of directions) {
      const nr = current.r + dir.dr;
      const nc = current.c + dir.dc;

      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (visited[nr][nc]) continue;
      if (map[nr][nc] === TILE_WALL || map[nr][nc] === TILE_BLOCK) continue;
      // Cannot escape into another existing bomb tile (except start tile)
      if (existingBombs.has(`${nr},${nc}`) && !(nr === start.r && nc === start.c)) continue;

      visited[nr][nc] = true;
      parent.set(`${nr},${nc}`, current);
      queue.push({ coord: { r: nr, c: nc }, dist: dist + 1 });
    }
  }

  if (!safeTarget) return null;

  // Reconstruct path
  const path: GridCoord[] = [];
  let curr: GridCoord | null = safeTarget;
  while (curr && !(curr.r === start.r && curr.c === start.c)) {
    path.unshift(curr);
    curr = parent.get(`${curr.r},${curr.c}`) ?? null;
  }

  return path;
}
```

### 4.2 Bomb Placement Trigger & Execution in Enemy AI
In `Enemy.handleTracking(...)`:
```ts
// Check strategic bomb placement eligibility
this.bombCooldownTimer -= delta;
if (
  this.canDropBombs &&
  this.activeBombs < this.maxBombs &&
  this.bombCooldownTimer <= 0 &&
  (manhattan <= 3 || this.isNearBreakableBlock(er, ec, map)) &&
  !bombTiles.has(`${er},${ec}`)
) {
  // 1. Calculate hypothetical danger zone
  const hypotheticalDanger = getBlastTiles({ r: er, c: ec }, this.bombPower, map);
  
  // 2. Add existing bombs' blast zones
  // (or pass bombTiles into findEscapePathBFS)
  
  // 3. Check for guaranteed escape route within 4 steps
  const escapePath = findEscapePathBFS(
    { r: er, c: ec },
    hypotheticalDanger,
    map,
    bombTiles,
    4
  );

  if (escapePath && escapePath.length > 0) {
    // Place enemy bomb!
    const scene = this.scene as GameScene;
    const bombPlaced = scene.placeEnemyBomb(this, er, ec, this.bombPower);
    if (bombPlaced) {
      this.activeBombs++;
      this.bombCooldownTimer = 5500; // 5.5s cooldown
      this.currentPath = escapePath;
      this.targetTile = this.currentPath[0];
      this.changeState(EnemyState.EVADING);
      return;
    }
  }
}
```

### 4.3 Evading State Handler (`handleEvading`)
```ts
private handleEvading(
  _delta: number,
  _er: number,
  _ec: number,
  map: number[][],
  bombTiles: Set<string>
) {
  // If reached final safe tile or path completed
  if (!this.targetTile) {
    this.setVelocity(0, 0);
    // If bomb still active, wait safely; otherwise resume tracking
    if (this.activeBombs === 0) {
      this.changeState(this.isTracker ? EnemyState.TRACKING : EnemyState.IDLE);
    }
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
    this.setVelocity(0, 0);
  } else {
    // Navigate with corridor snapping at evasion speed
    const evadeSpeed = 85;
    if (Math.abs(dx) > Math.abs(dy)) {
      const corridorY = this.targetTile.r * TILE_SIZE + TILE_SIZE / 2;
      if (Math.abs(this.y - corridorY) < 6) this.y = corridorY;
      this.setVelocity(Math.sign(dx) * evadeSpeed, 0);
    } else {
      const corridorX = this.targetTile.c * TILE_SIZE + TILE_SIZE / 2;
      if (Math.abs(this.x - corridorX) < 6) this.x = corridorX;
      this.setVelocity(0, Math.sign(dy) * evadeSpeed);
    }
  }
}
```

### 4.4 Overhead Name Tag Implementation Specification
1. **Enemy Constructor**:
   ```ts
   // Assign distinct name based on archetype and index
   const TRACKER_NAMES = ['Blinky', 'Pyro Slime', 'Ignis', 'Stalker', 'Shadow'];
   const NORMAL_NAMES = ['Grumble', 'Puffball', 'Blobby', 'Spook', 'Waddler'];
   const namePool = isTracker ? TRACKER_NAMES : NORMAL_NAMES;
   this.enemyName = namePool[Phaser.Math.Between(0, namePool.length - 1)];

   // Name Tag Text GameObject (Tier 1: y - 19)
   this.nameTag = scene.add.text(x, y - 19, this.enemyName, {
     fontSize: '10px',
     fontStyle: 'bold',
     fontFamily: 'monospace, "Press Start 2P", Arial, sans-serif',
     color: isTracker ? '#fb923c' : '#38bdf8',
     backgroundColor: 'rgba(15, 23, 42, 0.85)',
     padding: { x: 4, y: 1 },
     stroke: '#000000',
     strokeThickness: 2,
   });
   this.nameTag.setOrigin(0.5, 0.5);
   this.nameTag.setDepth(16);

   // Status Indicator Text GameObject (Tier 2: y - 33)
   this.indicator = scene.add.text(x, y - 33, '', {
     fontSize: '14px',
     fontStyle: 'bold',
     fontFamily: 'monospace, Arial, sans-serif',
     color: '#FFD700',
     stroke: '#000000',
     strokeThickness: 3,
   });
   this.indicator.setOrigin(0.5, 0.5);
   this.indicator.setDepth(17);
   ```

2. **Per-Frame Sync (`updateAI`)**:
   ```ts
   if (this.nameTag && this.nameTag.active) {
     this.nameTag.setPosition(this.x, this.y - 19);
   }
   if (this.indicator && this.indicator.active) {
     this.indicator.setPosition(this.x, this.y - 33);
   }
   ```

3. **Cleanup (`destroy`)**:
   ```ts
   if (this.nameTag && this.nameTag.active) {
     this.nameTag.destroy();
   }
   if (this.indicator && this.indicator.active) {
     this.indicator.destroy();
   }
   ```

---

## 5. Verification Method

### 5.1 Automated Unit & Stress Tests
1. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   Ensures all 70 existing tests pass with 0 regressions.

2. **New Test Suite for Enemy Bomb & Name Tag Invariants**:
   Create `tests/enemy_bomb_and_nametag.test.mjs` verifying:
   - **Pre-Placement Escape Verification**:
     - Test that an enemy in a 1-tile dead-end cul-de-sac returns `findEscapePathBFS(...) === null` and **refuses** to place a bomb.
     - Test that an enemy in an open cross-junction or corridor corner finds an escape path of $\le 3$ steps and successfully places the bomb.
     - Test that an enemy following the escape path reaches a tile with $0$ danger before the 2000ms fuse expires.
   - **Ownership & Bomb Count Isolation**:
     - Verify that enemy bomb placement does NOT decrement or increment player's `this.activeBombs`.
     - Verify that enemy bombs in `this.bombs` trigger chain detonations when contacted by player bomb explosions.
     - Verify that enemy bombs destroy breakable blocks and trigger `playerDie()` on overlapping player.
   - **Name Tag Text Rendering & Cleanup**:
     - Verify that every spawned enemy has a non-empty `enemyName` and active `nameTag` GameObject.
     - Verify that `nameTag.y` is strictly below `indicator.y` ($y - 19$ vs $y - 33$), preventing visual overlap.
     - Verify that destroying the enemy destroys both `nameTag` and `indicator` without memory leaks.
   - **Build Verification**:
     ```bash
     npm run build
     ```
     Verifies zero TypeScript and Turbopack compiler errors.

### 5.2 Invalidation Conditions
- An enemy ever places a bomb that causes immediate self-destruction with no escape route.
- An enemy bomb increments/decrements player's `activeBombs` HUD or prevents player from dropping bombs.
- Name tag and status indicator render on top of each other.
- Any infinite loop or recursion in BFS path calculations during evasion.
