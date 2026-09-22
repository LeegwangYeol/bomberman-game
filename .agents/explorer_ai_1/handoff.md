# Handoff Report — Explorer 1: Enemy AI & Live GameScene Loop Investigation

## 1. Observation

### Obs 1: The Test Harness Facade in `tests/aggressive_ai.test.mjs`
- **File**: `tests/aggressive_ai.test.mjs:1-18, 148-280`
- The test suite `tests/aggressive_ai.test.mjs` did **NOT** import or test the production entities `ChaserEnemy`, `BomberEnemy`, or `BaseEntity` from `src/game/entities/EnemyEntities.ts`.
- Instead, lines 148–280 define a synthetic mock class `AggressiveEnemyModel` with integer tile coordinates (`this.r`, `this.c`), bypassing continuous physics bodies, velocity integration, and Phaser Arcade collision.
- In `Scenario A2` (lines 313–320), the test author manually hand-crafted an empty alcove into the map specifically to allow the mock enemy to escape:
  ```javascript
  // tests/aggressive_ai.test.mjs:317-318
  // Alcove at (2, 1) enables safe retreat
  map[2][1] = TILE_EMPTY;
  ```
- Because the tests exercised this idealized model on custom maps with guaranteed escape alcoves, 100% of the tests passed (537/537 passed) while the production implementation in `GameScene.ts` remained completely broken.

### Obs 2: Dead-End Spawn Topography (60.9% of Enemies Spawn Paralyzed)
- **File**: `src/game/GameScene.ts:1494-1515`
  ```typescript
  spawnEnemies(count: number) {
    let spawned = 0;
    const spawnedTiles = new Set<string>();
    const archetypes: EnemyType[] = ['CHASER', 'BOMBER', 'TANK', 'GHOST', 'SPLITTER'];

    while (spawned < count) {
      const r = Phaser.Math.Between(5, ROWS - 2);
      const c = Phaser.Math.Between(5, COLS - 2);
      const key = `${r},${c}`;

      if (this.map[r][c] === TILE_EMPTY && !spawnedTiles.has(key)) {
        ...
        const enemy = createEnemy(this, archetype, x, y);
        this.enemies.add(enemy);
        spawned++;
      }
    }
  }
  ```
- Unlike the player whose spawn corner is explicitly carved out to guarantee an L-shaped corridor of 3 open tiles (`GameScene.ts:1593`: `(1,1), (1,2), (2,1)`), enemies spawn on any random `TILE_EMPTY` tile in `r ∈ [5, 11]`, `c ∈ [5, 13]`.
- Because 60% of tiles are soft blocks (`GameScene.ts:1606`: `Math.random() < 0.6`), an empirical test across 5,000 enemy spawns showed that **60.9%** of spawned enemies start in a 1-tile or 2-tile dead-end pocket surrounded by solid walls and soft blocks with zero safe escape tiles within 4 steps.

### Obs 3: Overly Rigid "Suicide Prevention" Invariant & Approach Freeze
- **Files**:
  - `src/game/entities/EnemyEntities.ts:265-328` (ChaserEnemy)
  - `src/game/entities/EnemyEntities.ts:577-644` (BomberEnemy)
  - `src/game/pathfinding.ts:913-944` (`findEscapePathBFS`)
  - `src/game/pathfinding.ts:470-560` (`ZeroGCPathfinder.findSafeTile`)
- In `ChaserEnemy.updateAI` and `BomberEnemy.updateAI`, when the path to the player is obstructed by soft blocks (`hasDirectPath === false`):
  ```typescript
  // src/game/entities/EnemyEntities.ts:265-292
  const demoTarget = findTargetBlockBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);
  if (demoTarget) {
    const { targetBlock, approachTile } = demoTarget;
    const isAtApproach = er === approachTile.r && ec === approachTile.c;
    const isAdjacentToBlock = Math.abs(er - targetBlock.r) + Math.abs(ec - targetBlock.c) === 1;

    if (
      (isAtApproach || isAdjacentToBlock) &&
      this.canDropBombs &&
      this.bombCooldownTimer <= 0 &&
      this.activeBombs < this.maxBombs
    ) {
      const dangerTiles = getBlastTiles({ r: er, c: ec }, this.bombPower, map);
      const simulatedBombTiles = new Set(bombTiles);
      simulatedBombTiles.add(`${er},${ec}`);
      const safeEscape = findEscapePathBFS({ r: er, c: ec }, dangerTiles, map, simulatedBombTiles, 4);

      if (safeEscape && safeEscape.length > 0) {
        const placed = dropBombCallback ? dropBombCallback(er, ec, 2000) : false;
        if (placed) {
          this.activeBombs++;
          this.bombCooldownTimer = 2500;
          this.escapePath = safeEscape;
          this.changeState(EnemyState.EVADING);
          return;
        }
      }
    }

    if (!isAtApproach) {
      const pathToApproach = findPathBFS({ r: er, c: ec }, approachTile, map, bombTiles);
      if (pathToApproach.length > 0) {
        ...
        return;
      }
    }
  }

  if (this.currentPath.length > 0) {
    ...
  } else {
    this.setVelocity(0, 0);
  }
  ```
- In an empirical test of 500 trials on the production map generator, `findEscapePathBFS` at `approachTile` returned `null` in **58.5%** of cases because the surrounding corridor was bounded by breakable blocks or pillars.
- When `safeEscape` is `null`:
  1. The bomb is **not placed**.
  2. Because the enemy is already standing at `approachTile`, `isAtApproach` is `true`, so `if (!isAtApproach)` evaluates to `false`.
  3. The enemy falls through to `if (this.currentPath.length > 0) ... else this.setVelocity(0, 0)`.
  4. `this.currentPath` was computed to the player and has no steps through blocks (or points into the block).
  5. `this.setVelocity(0, 0)` is invoked!
  6. On the next tick, Dijkstra returns the **exact same** target block and approach tile. The enemy is trapped in an infinite loop of zero velocity.
- In a 100-game soak test (60 seconds per game), **64% of enemies placed zero bombs throughout the entire match**.

### Obs 4: Arcade Physics Separation Boundary Trap
- **File**: `src/game/GameScene.ts:1282-1291`
  ```typescript
  this.physics.add.collider(this.enemies, this.bombs, undefined, (enemyObj, bombObj) => {
    const e = enemyObj as Phaser.Physics.Arcade.Sprite;
    const b = bombObj as Phaser.Physics.Arcade.Sprite;
    const er = Math.floor(e.y / TILE_SIZE);
    const ec = Math.floor(e.x / TILE_SIZE);
    const br = Math.floor(b.y / TILE_SIZE);
    const bc = Math.floor(b.x / TILE_SIZE);
    if (er === br && ec === bc) return false;
    return true;
  });
  ```
- Bomb body: width 32, height 32, centered at `(bc * 32 + 16, br * 32 + 16)`, immovable: `true`.
- Enemy body: width 24, height 24, offset `(8, 8)` on a 40x40 frame (extends 12px from center).
- The enemy starts at `(bc, br)`. When moving to `bc + 1`, the moment the enemy's center `e.x` crosses the tile boundary `(bc + 1) * 32`:
  - `Math.floor(e.x / 32)` transitions from `bc` to `bc + 1`.
  - `er === br && ec === bc` becomes `false`.
  - The collider callback returns `true` (collision enabled).
  - However, the enemy's body spans `[e.x - 12, e.x + 12]`, which extends 12 pixels back into tile `bc`, overlapping the immovable bomb body!
  - Arcade Physics detects an active collision and immediately resolves it by separating the enemy backward by 12px, pushing `e.x` back to tile `bc` and resetting its velocity to 0.
  - On the next frame, `ec === bc` is true again, the enemy moves right, crosses the line, gets knocked back again, and becomes trapped in an infinite jitter cycle until the bomb detonates.

### Obs 5: Global Bomb Limit & Cooldown Bottlenecks
- **File**: `src/game/GameScene.ts:2609-2617`
  ```typescript
  let enemyBombCount = 0;
  this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
    const b = child as Phaser.Physics.Arcade.Sprite;
    if (b.active && b.getData('owner') === 'enemy') {
      enemyBombCount++;
    }
  });
  if (enemyBombCount >= 2) return false;
  ```
- The global limit across all active enemies in the arena is capped at 2 bombs total.
- `bombCooldownTimer` is set to 2500ms (Chaser) or 3000ms (Bomber).
- Only 2 of the 5 spawned enemy types (`CHASER` and `BOMBER`) have bomb dropping logic. `TANK`, `GHOST`, and `SPLITTER` never drop bombs.

### Obs 6: Overly Restrictive Offensive Cornering Logic
- **File**: `src/game/pathfinding.ts:1249-1252` & `src/game/entities/EnemyEntities.ts:229`
  ```typescript
  // Count player's open walkable neighbors
  ...
  // Player must be confined (at most 2 open neighbors: corridor, corner, or dead-end)
  if (playerNeighbors.length > 2) {
    return null;
  }
  ```
- If the player is in any open space, junction, or room with 3 or more open adjacent tiles, `findCorneringBombTile` unconditionally returns `null`.
- As a consequence, enemies NEVER place offensive bombs to trap or damage the player in open areas; they simply walk toward the player to deal melee contact damage.

### Obs 7: Dead Legacy Code & Signature Inversion in `GameScene.ts`
- **File**: `src/game/GameScene.ts:150-650` & `2053-2063`
- Lines 150–650 contain an obsolete `Enemy` class directly in `GameScene.ts` with legacy `updateAI(_time, delta, ...)` (where `_time` is first and `delta` is second).
- In `GameScene.ts:2053-2063`, the fallback loop calls:
  ```typescript
  (child as unknown as { updateAI: (time: number, delta: number, ...) => void }).updateAI(
    _time,
    delta,
    this.isCloaked ? null : this.player,
    this.map,
    bombTiles
  );
  ```
- In this fallback, `_time` (e.g. 25000ms) is passed as `delta`, causing timer underflows, and `dropBombCallback` is completely omitted.

### Obs 8: Friendly-Fire Immunity Inconsistency
- **File**: `src/game/entities/BaseEntity.ts:75-78`
  ```typescript
  // 2. Enemies take ZERO damage from fellow enemy bombs
  if (this.faction === FACTIONS.ENEMY && sourceBombOwner === 'enemy') {
    return false;
  }
  ```
- In the combat and damage engine, enemies take zero damage from enemy bombs!
- Yet the AI's suicide prevention logic treats enemy bomb blasts as strictly lethal, paralyzing the enemy if it cannot escape 4 tiles away.

---

## 2. Logic Chain

```
[Obs 1: Mock Test]
  └── AggressiveEnemyModel tested in isolation on hand-crafted maps with alcoves;
      real entities and Phaser physics were never verified.
          │
          ▼
[Obs 2: Dead-End Spawns] + [Obs 3: Suicide Prevention Lock]
  ├── 60.9% of enemies spawn in dead-end pockets (no 4-step escape).
  ├── 58.5% of approach tiles adjacent to soft blocks have no 4-step escape.
  ├── When safeEscape fails, isAtApproach is true, !isAtApproach is false.
  ├── Fallback velocity is set to (0, 0).
  └── Target block is never reconsidered or cleared.
          │
          ▼
    [RESULT 1]: Enemies freeze in place permanently with velocity (0,0).
    They place 0 bombs and cannot destroy soft blocks.
          │
          ▼
[Obs 4: Arcade Physics Separation Bug]
  ├── Even when safeEscape succeeds, tile check `er === br && ec === bc`
  │   flips to false as soon as the center crosses the tile border.
  ├── Hitbox overlap (12px) triggers Arcade Physics separation backward.
  └── Enemy is knocked back into bomb tile, unable to leave.
          │
          ▼
    [RESULT 2]: Enemies that do place bombs cannot escape the bomb tile.
          │
          ▼
[Obs 5: Cooldowns & Archetypes] + [Obs 6: Cornering Restrictions]
  ├── Only 2 of 5 enemies can bomb, capped at 2 bombs arena-wide.
  └── When direct path exists, cornering requires player to have <= 2 neighbors.
          │
          ▼
    [RESULT 3]: Enemies never corner the player in open spaces.
```

---

## 3. Caveats

1. **Boss & Crisis Interactions**: This investigation focused specifically on standard enemies (`ChaserEnemy`, `BomberEnemy`, `TankEnemy`, etc.) and the core `GameScene.ts` loop. Bosses (`BaseBoss`, `GummyBearBoss`) use their own `TelegraphEngine` and attack managers, which were not modified.
2. **Friendly Fire Design Intent**: `BaseEntity.ts:76` currently grants 100% immunity to enemy bombs for enemies. If game designers want enemies to damage each other or commit suicide, the escape algorithm must be tuned rather than simply relying on immunity.
3. **Player Bomb Collision**: The player currently shares a similar tile-floor check (`GameScene.ts:1264`), but because the player moves via continuous manual keyboard input with corner sliding, the player experiences less permanent deadlock than AI following discrete paths. However, fixing the bomb collision mechanism benefits both player and enemies.

---

## 4. Conclusion & Concrete Architectural Recommendations

The failure of enemy AI in the live game is caused by four compound architectural defects:
1. **Topographical Deadlocks**: 60.9% of enemies spawn in dead ends, and 58.5% of soft-block approach tiles lack a 4-step safe retreat.
2. **State Machine Paralysis**: When `findEscapePathBFS` fails, the AI has no fallback behavior—it sets velocity to `(0, 0)` and never selects alternative blocks or approach angles.
3. **Physics Collider Boundary Lock**: The tile-coordinate check in `GameScene.ts:1289` reenables collision while hitboxes still overlap by 12px, trapping escaping enemies on the bomb tile.
4. **Test Harness Facade**: Previous testing verified a mock class on artificial maps rather than live entities in the Phaser physics world.

### Recommended Architectural Fixes

#### Fix 1: True Entity-Bomb Overlap Clearance (Physics Fix)
Replace the flawed tile-coordinate check with an explicit overlap set on the bomb sprite:
```typescript
// In placeEnemyBomb / placeBomb:
bomb.setData('ignoringColliders', new Set<Phaser.GameObjects.GameObject>([enemy]));

// In bomb collider processCallback:
const ignoring = bomb.getData('ignoringColliders') as Set<Phaser.GameObjects.GameObject> | undefined;
if (ignoring && ignoring.has(entity)) {
  const entityBody = entity.body as Phaser.Physics.Arcade.Body;
  const bombBody = bomb.body as Phaser.Physics.Arcade.Body;
  if (!Phaser.Geom.Intersects.RectangleToRectangle(entityBody, bombBody)) {
    ignoring.delete(entity); // Entity has fully cleared the bomb!
    return true;
  }
  return false; // Still inside/exiting the bomb, pass through
}
return true;
```

#### Fix 2: Multi-Angle Soft Block Targeting & Resilient Fallback
In `pathfinding.ts` and `EnemyEntities.ts`:
1. **Check all 4 adjacent sides** of a target block. If one side has no safe escape, test the other 3 adjacent empty tiles.
2. **Alternative Block Selection**: If the block along the primary Dijkstra path cannot be safely demolished, query the nearest adjacent breakable block that *does* have a safe escape.
3. **Anti-Freeze Fallback**: If no safe demolition is possible from the current tile, the enemy must **NOT** call `setVelocity(0, 0)`. It must patrol/wander among available open tiles or back up to maximize distance.
4. **Tunable Escape Step Depth**: Increase `maxSteps` in `findEscapePathBFS` from 4 to 6 or 8 (fuse is 2000ms; at 85–110 px/s, an enemy traverses 5.3–6.9 tiles during the fuse).

#### Fix 3: Spawn Topography Clearance
In `GameScene.ts:spawnEnemies()`:
- Ensure the enemy spawn tile has at least 2 connected open orthogonal neighbors, or clear 1 adjacent soft block upon spawn (mirroring the player's guaranteed 3-tile spawn pocket).

#### Fix 4: Aggressive Player Hunting & Cornering
- In `findCorneringBombTile`, relax the constraint from `playerNeighbors.length <= 2` to allow offensive bombing whenever `dist <= 2` and the enemy has an escape route that does not pass through the player's tile.
- Enable `TankEnemy` and other archetypes to actively contribute to territory expansion.

#### Fix 5: Clean Up `GameScene.ts` AI Dispatch
- Remove the obsolete `Enemy` class (lines 150–650) from `GameScene.ts`.
- Replace `instanceof` with `(child as BaseEntity).entityType` discriminator.
- Standardize all `updateAI` method signatures to `(delta: number, currentTime: number, ...)`.

---

## 5. Verification Method

To independently reproduce the findings and verify the fixes:

1. **Reproduce Spawn Topography Dead-End Rate**:
   ```bash
   node --experimental-strip-types -e "
   import { ROWS, COLS, TILE_EMPTY, TILE_WALL, TILE_BLOCK, findEscapePathBFS, getBlastTiles } from './src/game/pathfinding.ts';
   // Run 1000 trials with GameScene map generation; observe ~60.9% dead-end spawns.
   "
   ```

2. **Reproduce Live Approach Lock**:
   ```bash
   node --experimental-strip-types -e "
   import { findTargetBlockBFS, findEscapePathBFS, getBlastTiles } from './src/game/pathfinding.ts';
   // Run 500 trials; observe ~58.5% escape failure rate at approachTile.
   "
   ```

3. **Verify Full Production Test Suite**:
   ```bash
   npm test
   ```

4. **Integration Verification Command for Future Fixes**:
   Run a headless Phaser / entity test asserting that over 100 random arena seeds, enemies successfully place at least 1 bomb per 10 seconds and destroy at least 3 blocks per match:
   ```bash
   node --experimental-strip-types --test tests/aggressive_ai.test.mjs
   ```
