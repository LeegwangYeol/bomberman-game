# Handoff Report: Player Movement, Physics Body & Corner-Sliding Refinement

**Agent**: explorer_movement_refine  
**Date**: 2026-09-15T01:26:30Z  
**Target Milestone**: Smooth Player Movement & Corner Sliding (R1)  
**Parent Agent**: 5ba8d8e8-7e3d-47e7-b8f4-049c5ea9cdec  

---

## 1. Observation

### 1.1 Physics Engine & Configuration
- **File**: `src/components/BombermanGame.tsx` (lines 83–89):
  ```typescript
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0, x: 0 },
      debug: false,
    },
  },
  ```
  The game uses **Phaser Arcade Physics**, an Axis-Aligned Bounding Box (AABB) physics system. Arcade Physics does not natively model rounded corners, bevels, or tangential sliding forces. When an AABB collides with a static body along one axis, Arcade Physics resolves collision by zeroing velocity along the collision normal and separating the bounding boxes.

### 1.2 Grid Geometry and Asset Dimensions
- **File**: `src/game/pathfinding.ts` (lines 1–3):
  ```typescript
  export const TILE_SIZE = 40;
  export const ROWS = 13;
  export const COLS = 15;
  ```
- **Asset Dimensions** (verified via `sips -g pixelWidth -g pixelHeight public/assets/*.png`):
  All game assets (`player.png`, `enemy.png`, `wall.png`, `block.png`, `bomb.png`, `floor.png`) are exactly **40 × 40 pixels**.
- **Corridor Width**: Grid corridors are 1 tile wide ($40\text{px}$).

### 1.3 Player Sprite and Hitbox Initialization
- **File**: `src/game/GameScene.ts` (lines 334–341):
  ```typescript
  this.player = this.physics.add.sprite(
    1 * TILE_SIZE + TILE_SIZE / 2,
    1 * TILE_SIZE + TILE_SIZE / 2,
    'player'
  );
  this.player.setCollideWorldBounds(true);
  this.player.setDepth(10);
  (this.player.body as Phaser.Physics.Arcade.Body)?.setSize(28, 28).setOffset(6, 6);
  ```
  - Player hitbox: $28 \times 28\text{px}$, centered with offset $(6, 6)$ inside the $40 \times 40\text{px}$ sprite.
  - Clearance to corridor boundaries: $(40 - 28) / 2 = 6\text{px}$ on each side.

### 1.4 Player Movement Logic & Input Priority
- **File**: `src/game/GameScene.ts` (lines 448–465):
  ```typescript
  // Movement
  const speed = 150;
  this.player.setVelocity(0);

  const mInput = window.mobileInput || { up: false, down: false, left: false, right: false, bomb: false };

  if (this.cursors.left.isDown || mInput.left) {
    this.player.setVelocityX(-speed);
    this.player.setFlipX(true);
  } else if (this.cursors.right.isDown || mInput.right) {
    this.player.setVelocityX(speed);
    this.player.setFlipX(false);
  } else if (this.cursors.up.isDown || mInput.up) {
    this.player.setVelocityY(-speed);
  } else if (this.cursors.down.isDown || mInput.down) {
    this.player.setVelocityY(speed);
  }
  ```

### 1.5 Enemy Corridor Snapping Already Present
- **File**: `src/game/GameScene.ts` (lines 141–156):
  ```typescript
  // Orthogonal waypoint snapping to eliminate corridor corner-snagging
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal primary motion: snap orthogonal Y to corridor center
    const corridorY = this.targetTile.r * TILE_SIZE + TILE_SIZE / 2;
    if (Math.abs(this.y - corridorY) < 6) {
      this.y = corridorY;
    }
    this.setVelocity(Math.sign(dx) * this.baseSpeed, 0);
  } else {
    // Vertical primary motion: snap orthogonal X to corridor center
    const corridorX = this.targetTile.c * TILE_SIZE + TILE_SIZE / 2;
    if (Math.abs(this.x - corridorX) < 6) {
      this.x = corridorX;
    }
    this.setVelocity(0, Math.sign(dy) * this.baseSpeed);
  }
  ```
  *Crucial Contrast*: The `Enemy` AI class already explicitly implements orthogonal corridor snapping to eliminate corner-snagging, but `player` has zero corridor alignment or corner-sliding assist.

---

## 2. Logic Chain

### 2.1 The Mathematics of Wall Snagging
1. **Narrow Clearance Margin (Observation 1.2 & 1.3)**:
   - In a $40\text{px}$ corridor, a $28\text{px}$ hitbox leaves only $6\text{px}$ of clearance on either side:
     $$\text{Margin} = \frac{\text{TILE\_SIZE} - \text{Hitbox Width}}{2} = \frac{40 - 28}{2} = 6\text{px}$$
   - Any horizontal offset $|\Delta x| > 6\text{px}$ causes the player's AABB to overlap the adjacent column's $40\times 40$ wall/block.

2. **Zero Orthogonal Velocity & Normal Collision Halting (Observation 1.1 & 1.4)**:
   - When the player presses `UP` or `DOWN`, `this.player.setVelocity(0)` zeroes both axes, and then only `setVelocityY` is assigned.
   - Therefore, $v_x = 0$.
   - When moving vertically, if the player's X coordinate is even $7\text{px}$ off-center, the player's leading corner overlaps the static wall AABB.
   - Phaser Arcade Physics separates the player on the Y axis and sets `body.blocked.up = true` (or `down = true`).
   - Because $v_x = 0$, there is zero tangential force to slide the player into the corridor. The player comes to a complete, dead stop.

3. **Input Ladder Priority Locks Out Vertical Motion (Observation 1.4)**:
   - The chained `if (left) ... else if (right) ... else if (up) ... else if (down)` enforces a strict priority hierarchy:
     $$\text{LEFT} > \text{RIGHT} > \text{UP} > \text{DOWN}$$
   - When a player holds an arrow key to turn a corner (e.g. holding `UP` and then pressing `RIGHT`, or mobile joystick transition across $45^\circ$), `RIGHT` completely mutes `UP`.
   - If the player is still inside the vertical corridor when pressing `RIGHT`, `setVelocityX(speed)` is invoked while `setVelocityY` remains $0$. The player instantly halts against the vertical wall.
   - This directly explains why the user reported: *"player snags or gets stuck on walls when moving vertically or turning corners"*.

### 2.2 Corner-Sliding & Alignment Assist Solution
To achieve classic, fluid Bomberman arcade navigation, two complementary mechanisms are required:

#### Mechanism A: Hitbox Tuning
- Change player physics body from $28 \times 28$ (offset 6, 6) to **$24 \times 24$ (offset 8, 8)**.
- **Physical clearance increases by 33%**: from $6\text{px}$ to $8\text{px}$ on every side:
  $$\text{Slack} = \frac{40 - 24}{2} = 8\text{px}$$
- This creates a generous $16\text{px}$-wide unobstructed center corridor (40% of tile width) while maintaining visual accuracy for the $40 \times 40$ cute character.

#### Mechanism B: Dual-Phase Corridor & Corner Assist
When an input direction is registered:

1. **Phase 1: Corridor Centering Assist (Direct Path Open)**:
   - If the target tile in the primary direction is PASSABLE (`map[r][c] === TILE_EMPTY` and no unowned bomb):
   - Measure the perpendicular offset from the corridor center line:
     $$\Delta_{\perp} = \text{pos}_{\perp} - \text{center}_{\perp}$$
   - If $|\Delta_{\perp}| > \text{SNAP\_THRESHOLD}$ ($2\text{px}$):
     $$v_{\perp} = -\text{sign}(\Delta_{\perp}) \cdot \text{SLIDE\_SPEED}$$
   - If $|\Delta_{\perp}| \le \text{SNAP\_THRESHOLD}$:
     $$\text{pos}_{\perp} = \text{center}_{\perp}, \quad v_{\perp} = 0$$
   - *Result*: While moving forward, the player is dynamically and smoothly pulled into the exact corridor center, completely preventing edge scraping against walls.

2. **Phase 2: Corner-Rounding Assist (Direct Path Obstructed, Corner Turn Available)**:
   - If the target tile directly ahead is BLOCKED, check if an adjacent perpendicular corridor is PASSABLE (e.g. when turning a corner slightly early or cutting a corner):
   - If the adjacent corridor is open and the player is offset towards that opening ($|\Delta_{\perp}| > 3\text{px}$):
     $$v_{\perp} = \text{sign}(\text{target\_offset}) \cdot \text{SLIDE\_SPEED}$$
   - *Result*: Instead of stopping dead against the corner of the wall, the player slides around the corner until the new corridor opens up, then seamlessly surges forward.

3. **Phase 3: Dead-End Protection**:
   - If the path directly ahead is blocked AND adjacent paths are also blocked (e.g. running into a solid wall or corner between two walls), no perpendicular velocity is applied ($v_{\perp} = 0$).
   - *Result*: No "ghost sliding" sideways into flat walls.

4. **Phase 4: Multi-Input / Diagonal Resolution**:
   - If both an X-input and a Y-input are active:
     - Check passability: if one axis is open and the other is blocked by a wall, prioritize the open axis!
     - If both are open, prioritize the most recently pressed key (`timeDown`).

---

## 3. Caveats & Edge Cases

1. **Active Bomb Collisions**:
   - When the player places a bomb, the bomb is created at the center of the player's current tile with an immovable body.
   - `isPassable` must ignore a bomb if the player's current tile matches the bomb's tile (`row === bombRow && col === bombCol`); otherwise, the assist could prevent the player from stepping off the bomb they just placed.
   - Once the player steps off the bomb tile, the bomb is treated as an impassable obstacle.
   - **Recommended Bomb Hitbox**: Change bomb hitbox from $36 \times 36$ (offset 2, 2) to **$32 \times 32$ (offset 4, 4)**. In a $40 \times 40$ grid, $32 \times 32$ leaves $4\text{px}$ clearance on all sides, ensuring players and enemies do not get clipped on $2\text{px}$ bomb borders when walking past adjacent corridors.

2. **Enemy Overlap & Collision**:
   - Changing player hitbox to $24 \times 24$ does not compromise enemy collision. Enemy collision is handled via `this.physics.add.overlap(this.player, this.enemies, ...)`. A $24 \times 24$ player body gives an even fairer, less punishing feel when dodging close-quarters enemy attacks.
   - Enemy hitbox should also ideally be set to $24 \times 24$ (offset 8, 8) for consistent collision behavior.

3. **Delta Time Independence**:
   - Arcade Physics `setVelocity(vx, vy)` sets velocity in units of pixels/second. Phaser automatically scales this by `delta / 1000` during physics integration. The slide velocity is therefore fully framerate-independent.

---

## 4. Conclusion & Concrete Implementation Strategy

### Recommended Action Plan for Workers:
1. **Hitbox Adjustment**:
   - In `src/game/GameScene.ts` line 341: Update player body size:
     ```typescript
     (this.player.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(8, 8);
     ```
   - In `src/game/GameScene.ts` line 514: Update bomb body size:
     ```typescript
     (bomb.body as Phaser.Physics.Arcade.Body)?.setSize(32, 32).setOffset(4, 4);
     ```
   - In `src/game/GameScene.ts` lines 61 & 391: Update enemy body size:
     ```typescript
     (this.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(8, 8);
     ```

2. **Replace Player Movement Block in `update()`**:
   Replace lines 448–465 in `src/game/GameScene.ts` with the robust `updatePlayerMovement()` method:

```typescript
  /**
   * Smooth Corridor Centering and Corner-Sliding Movement Controller
   */
  private updatePlayerMovement() {
    if (!this.player || !this.player.body) return;

    const mInput = window.mobileInput || { up: false, down: false, left: false, right: false, bomb: false };
    const left = Boolean(this.cursors?.left?.isDown || mInput.left);
    const right = Boolean(this.cursors?.right?.isDown || mInput.right);
    const up = Boolean(this.cursors?.up?.isDown || mInput.up);
    const down = Boolean(this.cursors?.down?.isDown || mInput.down);

    if (!left && !right && !up && !down) {
      this.player.setVelocity(0, 0);
      return;
    }

    const speed = 150;
    const slideSpeed = 150;
    const snapThreshold = 2;

    const px = this.player.x;
    const py = this.player.y;

    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);

    const colCenterX = col * TILE_SIZE + TILE_SIZE / 2;
    const rowCenterY = row * TILE_SIZE + TILE_SIZE / 2;

    const diffX = px - colCenterX;
    const diffY = py - rowCenterY;

    // Fast check for tile passability avoiding walls, blocks, and other active bombs
    const isPassable = (r: number, c: number): boolean => {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
      if (this.map[r][c] !== TILE_EMPTY) return false;

      let hasBomb = false;
      this.bombs.getChildren().forEach((child) => {
        const b = child as Phaser.Physics.Arcade.Sprite;
        if (b.active) {
          const br = Math.floor(b.y / TILE_SIZE);
          const bc = Math.floor(b.x / TILE_SIZE);
          if (br === r && bc === c) {
            // Allow stepping off a bomb if player is currently on it
            if (!(row === r && col === c)) {
              hasBomb = true;
            }
          }
        }
      });
      return !hasBomb;
    };

    // Directional intent
    let wantX = 0;
    let wantY = 0;
    if (left && !right) wantX = -1;
    else if (right && !left) wantX = 1;

    if (up && !down) wantY = -1;
    else if (down && !up) wantY = 1;

    // Resolve dominant axis when multiple inputs are pressed
    let primaryAxis: 'x' | 'y' = 'x';
    if (wantX !== 0 && wantY !== 0) {
      const xOpen = isPassable(row, col + wantX);
      const yOpen = isPassable(row + wantY, col);

      if (xOpen && !yOpen) {
        primaryAxis = 'x';
      } else if (yOpen && !xOpen) {
        primaryAxis = 'y';
      } else {
        const timeX = wantX < 0 ? (this.cursors?.left?.timeDown ?? 0) : (this.cursors?.right?.timeDown ?? 0);
        const timeY = wantY < 0 ? (this.cursors?.up?.timeDown ?? 0) : (this.cursors?.down?.timeDown ?? 0);
        primaryAxis = timeY > timeX ? 'y' : 'x';
      }
    } else if (wantX !== 0) {
      primaryAxis = 'x';
    } else if (wantY !== 0) {
      primaryAxis = 'y';
    }

    let vx = 0;
    let vy = 0;

    if (primaryAxis === 'x') {
      vx = wantX * speed;
      this.player.setFlipX(wantX < 0);

      const nextCol = col + wantX;
      const directOpen = isPassable(row, nextCol);

      if (directOpen) {
        // Phase 1: Corridor Centering
        if (Math.abs(diffY) > snapThreshold) {
          vy = -Math.sign(diffY) * slideSpeed;
        } else {
          this.player.y = rowCenterY;
          vy = 0;
        }
      } else {
        // Phase 2: Corner Rounding
        const canRoundUp = diffY < -3 && isPassable(row - 1, col) && isPassable(row - 1, nextCol);
        const canRoundDown = diffY > 3 && isPassable(row + 1, col) && isPassable(row + 1, nextCol);

        if (canRoundUp) {
          vy = -slideSpeed;
        } else if (canRoundDown) {
          vy = slideSpeed;
        } else {
          vy = 0;
        }
      }
    } else {
      vy = wantY * speed;

      const nextRow = row + wantY;
      const directOpen = isPassable(nextRow, col);

      if (directOpen) {
        // Phase 1: Corridor Centering
        if (Math.abs(diffX) > snapThreshold) {
          vx = -Math.sign(diffX) * slideSpeed;
        } else {
          this.player.x = colCenterX;
          vx = 0;
        }
      } else {
        // Phase 2: Corner Rounding
        const canRoundLeft = diffX < -3 && isPassable(row, col - 1) && isPassable(nextRow, col - 1);
        const canRoundRight = diffX > 3 && isPassable(row, col + 1) && isPassable(nextRow, col + 1);

        if (canRoundLeft) {
          vx = -slideSpeed;
          this.player.setFlipX(true);
        } else if (canRoundRight) {
          vx = slideSpeed;
          this.player.setFlipX(false);
        } else {
          vx = 0;
        }
      }
    }

    this.player.setVelocity(vx, vy);
  }
```

---

## 5. Verification Method

### 5.1 Automated Unit & Simulation Tests
1. **Existing Test Suite**:
   ```bash
   npm test
   ```
   Ensures all 25 BFS pathfinding, joystick angle mapping, and state machine tests pass without regression.

2. **Standalone Corner-Sliding Mathematical Verification**:
   ```bash
   node --test .agents/explorer_movement_refine/verify_corner_sliding.mjs
   ```
   Directly validates:
   - Straight corridor automatic centering (left & right offsets)
   - Zero jitter snap threshold
   - Corner rounding assist past pillar corners
   - Dead-end safety (zero ghost sliding)
   - Prioritization of open axis over wall-blocked axis on simultaneous input
   *(Result: 6/6 tests passed in 38ms).*

3. **Build & Lint Verification**:
   ```bash
   npm run lint
   npm run build
   ```
   Ensures zero TypeScript errors and successful Next.js build.

### 5.2 Manual Browser Interactive Verification
1. Navigate down a vertical corridor while slightly holding against the wall: player must glide cleanly without stopping.
2. Turn a corner at high speed by pressing the turn key $10\text{px}$ before reaching the intersection: player must round the corner automatically.
3. Drop a bomb and immediately walk away: player smoothly exits without getting trapped.
4. Run into a dead end outer wall: player stops flush with no jitter or sideways ghost sliding.
