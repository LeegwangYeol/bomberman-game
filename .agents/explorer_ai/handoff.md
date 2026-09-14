# Handoff Report: Enemy AI & GameScene Architecture Exploration

**Agent Name**: explorer_ai  
**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_ai`  
**Handoff Type**: Hard (Investigation Complete)  
**Date**: 2026-09-14  

---

## 1. Observation

1. **`src/game/GameScene.ts` (Lines 3–10)**:
   ```typescript
   const TILE_SIZE = 40;
   const ROWS = 13;
   const COLS = 15;

   const TILE_EMPTY = 0;
   const TILE_WALL = 1;
   const TILE_BLOCK = 2;
   ```
   The grid consists of $13 \times 15 = 195$ tiles. Centering offset is $X=100\text{px}$, $Y=40\text{px}$ on an $800 \times 600$ viewport.

2. **`src/game/GameScene.ts` (Lines 107–114, 123–143)**:
   Enemies are spawned into `this.enemies = this.physics.add.group()` on random empty tiles with `setSize(24, 24)` and an initial integer direction `0..3`. Collisions are set with `walls`, `blocks`, and `bombs`. Player contact triggers `this.playerDie()`.

3. **`src/game/GameScene.ts` (Lines 210–233)**:
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
   Enemies do NOT track the player (`this.player.x, y` is completely unreferenced). They choose random directions upon collision, possess no attack state, and frequently snag on corners.

4. **`package.json` & Build Baseline**:
   `npm run build` was executed via `run_command` and succeeded cleanly (`exit code 0`, 4/4 static pages generated). Next.js version is `16.3.5`, Phaser version is `^4.2.1`.

---

## 2. Logic Chain

1. **Premise 1 (From Obs 3)**: Current enemy movement relies entirely on `Phaser.Math.Between(0, 3)` triggered on `body.blocked`. There is no tracking algorithm or attack phase.
2. **Premise 2 (From Obs 1)**: The arena is a discrete $13 \times 15$ grid (195 tiles). A full Breadth-First Search (BFS) over 195 nodes takes $<0.05\text{ms}$ in JavaScript V8, making it an optimal, lightweight pathfinder with zero heuristic overhead.
3. **Premise 3 (Corridor Snagging)**: Continuous physics velocity in Arcade Physics causes sprites to clip 90-degree corridor corners when misaligned by even 2px. Therefore, pathfinding must incorporate tile-center waypoint following: snapping the orthogonal axis before stepping into the target tile.
4. **Premise 4 (Tactical Fairness & R2 Requirement)**: Bomberman requires intentional attack telegraphing because bombs have a 2.0s fuse delay. An instant attack feels cheap, while no attack violates requirement R2 ("Enemy update logic includes tracking the player's position and executing an attack").
5. **Deduction**: A 4-stage state machine (`TRACKING` $\rightarrow$ `WINDUP` $\rightarrow$ `ATTACK` $\rightarrow$ `COOLDOWN`):
   - In `TRACKING`, the enemy follows the BFS path toward the player's grid cell.
   - When in Line-of-Sight ($\le 6$ tiles unobstructed) or close proximity, it enters `WINDUP` (450ms red alert telegraph, zero velocity).
   - Once windup expires, it executes `ATTACK` (charge dash at 200 px/s along the locked corridor vector).
   - Upon impact with a wall, block, or timer expiration, it transitions to `COOLDOWN` (1200ms vulnerable recovery, blue tint), giving the player a tactical opening to plant a bomb.

---

## 3. Caveats

1. **Destructible Block Isolation**: If the player is completely surrounded by unbroken soft blocks, no open path exists between enemy and player. The BFS algorithm handles this via a nearest-reachable Manhattan distance fallback so the enemy patrols the outer perimeter rather than freezing.
2. **Phaser Version Compatibility**: Phaser 4.2.1 is installed. Subclassing `Phaser.Physics.Arcade.Sprite` with `scene.add.existing(this)` and `scene.physics.add.existing(this)` is standard and fully supported.
3. **Image Asset Decoupling**: This investigation focuses on AI and GameScene logic; texture keys (`'enemy'`, `'player'`) seamlessly accept either procedural graphics textures or loaded PNG assets without changing AI logic.

---

## 4. Conclusion

1. The current enemy implementation in `src/game/GameScene.ts` is a primitive random-walk prototype that fails requirements R2 and R3.
2. The recommended architecture replaces the anonymous sprite logic with an encapsulated `Enemy` class (or modular helper) integrating:
   - **BFS Grid Pathfinding** with fallback nearest-frontier navigation and active bomb hazard avoidance.
   - **Waypoint Navigation** with corridor alignment to eliminate corner snagging.
   - **4-Stage Attack State Machine**: Tracking (75 px/s) $\rightarrow$ Windup (450ms red alert) $\rightarrow$ Charge Attack (200 px/s) $\rightarrow$ Cooldown (1200ms vulnerable).
3. The complete design, algorithm code, and integration contract are documented in `/Users/user/src/bomberman/.agents/explorer_ai/report.md`.

---

## 5. Verification Method

1. **Build Verification**:
   ```bash
   npm run build
   ```
   Must exit with code 0 without any TypeScript or bundling errors.
2. **Behavioral Inspection**:
   - Verify `findPathBFS` returns valid step sequences avoiding walls and blocks.
   - Verify in `GameScene.update` that `this.enemies` updates with `(time, delta)` and tracks `this.player`.
   - Verify enemy triggers `WINDUP` (red tint) upon line-of-sight alignment and executes charge attack.
   - Verify enemy enters `COOLDOWN` (blue tint) upon hitting a wall or completing charge.
3. **Invalidation Conditions**:
   - Any compiler error in `npm run build`.
   - Enemy phasing through solid indestructible walls or freeze-locking when path is blocked.
