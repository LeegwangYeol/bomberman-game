# Handoff Report: Dynamic Gameplay Mechanics, Items, Skills, Gimmicks & React-Phaser Bridge

**Agent**: `explorer_mech_gameplay`  
**Milestone**: `dynamic_gameplay_and_ui`  
**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_mech_gameplay`  
**Date**: 2026-09-15T04:14:45Z  

---

## 1. Observation

Direct observations from `/Users/user/src/bomberman/src/game/GameScene.ts` and `/Users/user/src/bomberman/src/components/BombermanGame.tsx`:

### 1.1 Block Destruction and Absence of Item Drops
In `src/game/GameScene.ts`:
- **Block Storage & Generation** (lines 787–800):
  ```typescript
  else if (Math.random() < 0.6) {
    this.map[r][c] = TILE_BLOCK;
    const block = this.blocks.create(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 'block') as Phaser.Physics.Arcade.Sprite;
    block.setDepth(1);
    block.setData('row', r);
    block.setData('col', c);
    block.refreshBody();
  }
  ```
- **Block Destruction Trigger** in `explodeBomb()` (lines 1123–1128):
  ```typescript
  if (this.map[nr][nc] === TILE_BLOCK) {
    // Destroy block and stop
    this.destroyBlock(nr, nc);
    this.spawnExplosion(nr, nc, false);
    break;
  }
  ```
- **Current `destroyBlock()` Implementation** (lines 1177–1209):
  ```typescript
  destroyBlock(row: number, col: number) {
    this.map[row][col] = TILE_EMPTY;
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;

    this.blocks.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b && b.active && b.getData('row') === row && b.getData('col') === col) {
        // Spawn 4 crumbling debris fragments
        ...
        b.destroy();
      }
    });
  }
  ```
- **Finding**: When blocks are destroyed, only 4 debris rectangles are created (`b.destroy()`). There is **zero item drop logic**, **no item physics group**, and **no item pickup overlap** in `GameScene.ts`.

### 1.2 Hardcoded Player Stats & Scope
In `src/game/GameScene.ts`:
- **Bomb Capacity & Blast Radius** (lines 642–644):
  ```typescript
  private activeBombs: number = 0;
  private maxBombs: number = 1;
  private bombPower: number = 2; // blast radius
  ```
- **Player Movement Speed** (lines 857–858):
  ```typescript
  const speed = 150;
  const slideSpeed = 150;
  ```
  `speed` is currently declared as a local constant inside `updatePlayerMovement()`, rather than an instance property (`this.playerSpeed`). It cannot be dynamically modified by power-ups without refactoring to a class field.
- **Player Reset on Death** (lines 1218–1222):
  ```typescript
  this.time.delayedCall(1000, () => {
    this.isGameOver = false;
    this.activeBombs = 0;
    this.scene.restart();
  });
  ```
  `this.scene.restart()` completely reinitializes the scene, resetting stats back to defaults unless explicitly preserved or persisted.

### 1.3 React <-> Phaser Communication Bottleneck
In `src/components/BombermanGame.tsx`:
- **One-Way Input Bridge** (lines 18–22, 43, 77–99):
  ```typescript
  declare global {
    interface Window {
      mobileInput: MobileInputState;
    }
  }
  ```
  `BombermanGame.tsx` writes input states (`up, down, left, right, bomb`) to `window.mobileInput`. `GameScene.ts` polls `window.mobileInput` in `update()` (lines 812, 846).
- **Phaser Game Instantiation** (lines 78–99):
  `phaserGameRef.current = new Phaser.Game(config);`
  The React component never attaches event listeners to `phaserGameRef.current.events` or the scene.
- **HUD Status** (lines 153–234):
  The UI contains a decorative arcade cabinet frame and header, but **no real-time stats display** (active/max bombs, fire power, movement speed, collected items, or skill cooldowns).

### 1.4 Map Layout and Static Grid Parameters
In `src/game/pathfinding.ts` (lines 1–8):
- `TILE_SIZE = 40`, `ROWS = 13`, `COLS = 15` (800x600 canvas with arena centered at offset `(100, 40)`).
- `TILE_EMPTY = 0`, `TILE_WALL = 1`, `TILE_BLOCK = 2`.
- Active bombs are avoided via `bombTiles: Set<string>`.

---

## 2. Logic Chain

From these observations, we deduce the exact architectural requirements for implementing dynamic gameplay mechanics:

```
[Observation 1.1: destroyBlock() destroys block without drop]
           ↓
(Deduction 1: Add probabilistic item roll in destroyBlock() + Item Physics Group)
           ↓
[Observation 1.2: speed/bombPower/maxBombs hardcoded]
           ↓
(Deduction 2: Promote speed to this.playerSpeed, create PlayerStats model with caps)
           ↓
(Deduction 3: Define 3 core power-ups + optional skills with physics overlap pickups)
           ↓
[Observation 1.3: One-way window.mobileInput communication]
           ↓
(Deduction 4: Implement Event-driven React <-> Phaser Bridge via game.events)
           ↓
(Deduction 5: Render dynamic retro arcade HUD in BombermanGame.tsx)
```

### 2.1 Item Drop Architecture & Probabilities
When a block is destroyed at `(row, col)`:
1. **Drop Chance**: A 45% overall probability (`Math.random() < 0.45`) ensures healthy item pacing (~25 items across ~55 blocks).
2. **Item Type Distribution Table**:

| Power-Up Item | Type Key | Weight | Base Value | Upgrade Delta | Max Cap | Visual Representation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Speed Up** | `SPEED_UP` | 20% | 150 px/s | +25 px/s | 250 px/s (Lv. 5) | Cyan roller skate / winged shoe with lightning bolt |
| **Bomb Up** | `BOMB_UP` | 40% | 1 bomb | +1 bomb | 8 bombs | Obsidian classic bomb with sparkling fuse |
| **Fire Up** | `FIRE_UP` | 40% | 2 tiles | +1 tile radius | 8 tiles | Crimson flame / blaze flare |
| *Bonus: Bomb Kick* | `KICK` | Special (5%) | False | Unlocked | True | Emerald soccer cleat / kick boot |
| *Bonus: Heart Shield* | `SHIELD` | Special (5%) | 0 | +1 hit barrier | 1 hit | Golden heart / iridescent bubble |

3. **Spawn Mechanics & Explosion Grace Period**:
   - Items are stored in `this.items = this.physics.add.group()`.
   - Each item has `body.setSize(24, 24).setOffset(8, 8)` and `depth = 4` (above floor `0`, below player `10`).
   - **Critical Game-Feel Rule**: To prevent the very explosion that broke the block from destroying the newly dropped item, the item records `spawnTime = this.time.now`. In explosion overlap checks:
     `if (this.time.now - item.getData('spawnTime') > 600) { item.destroy(); }`
     Subsequent bomb explosions will incinerate dropped items (classic Bomberman behavior), but freshly spawned items survive their parent block's blast.
   - **Floating Animation**:
     A subtle y-axis bobbing tween (`y: '-=3'`, duration `450ms`, `yoyo: true`, `repeat: -1`) makes items instantly recognizable and enticing.

4. **Procedural Texture Fallback vs PNG**:
   To avoid missing asset 404s or bundler issues, `GameScene` can generate pixel-perfect retro canvas textures directly via `scene.textures.createCanvas()` or `scene.add.graphics().generateTexture()` during `preload()` / `create()`:
   - `item_speed`: Cyan rounded rect (32x32) with white wing/lightning glyph.
   - `item_bomb`: Slate-gray rounded rect with black bomb body and yellow spark.
   - `item_fire`: Orange-red rounded rect with yellow dual-tongue flame.
   - `item_kick`: Lime green rounded rect with boot silhouette.
   - `item_shield`: Amber/gold rounded rect with shield rune.

5. **Pickup Overlap & Stat Mutation**:
   ```typescript
   this.physics.add.overlap(this.player, this.items, (playerObj, itemObj) => {
     const item = itemObj as Phaser.Physics.Arcade.Sprite;
     const type = item.getData('itemType') as ItemType;
     this.applyPowerUp(type);
     this.spawnFloatingText(item.x, item.y, type);
     this.spawnPickupParticles(item.x, item.y);
     item.destroy();
     this.emitStatsUpdate();
   });
   ```

### 2.2 Player Skills & Mechanics
1. **Bomb Kick (Passive/Active)**:
   - **Condition**: Player collides with an active bomb while moving towards it with velocity `(vx, vy)`.
   - **Execution**: If `this.canKick === true`:
     - Determine movement direction: `dirX = Math.sign(vx)`, `dirY = Math.sign(vy)`.
     - Check if adjacent tile in that direction is open (`isPassable(bombRow + dirY, bombCol + dirX)`).
     - If open, transition bomb to sliding state: `bomb.setData('isSliding', true)`, `bomb.setVelocity(dirX * 300, dirY * 300)`.
     - Slide update: In `GameScene.update()`, sliding bombs check upcoming grid tiles. When hitting a wall, block, or another bomb, stop sliding, zero velocity, and snap to tile center (`x = col * 40 + 20, y = row * 40 + 20`).
     - Impact: If a sliding bomb collides with an enemy, stun the enemy for 1500ms or trigger an instant detonation!

2. **Dash / Evade Skill**:
   - **Input**: Key `Shift` / `E`, or mobile "DASH" button.
   - **Effect**: Accelerate player to `350 px/s` in current facing direction for `140ms`, spawning 3 fading ghost afterimages (`player.setAlpha(0.6)` clones fading out).
   - **Cooldown**: 3.5 seconds with cooldown timer.
   - **Safety**: Invulnerability frames (`isInvulnerable = true` for `140ms`), enabling dodging past tight enemy corridors or escaping near-detonation blasts.

3. **Barrier / Shield**:
   - **Effect**: Absorb 1 lethal hit (enemy contact or explosion).
   - **Visual**: Orbiting translucent cyan bubble around player sprite.
   - **Resolution**: On fatal collision, if `hasShield === true`, consume shield, trigger camera shake (60ms), spawn shatter particles, and grant 1.5s flashing invincibility instead of triggering `playerDie()`.

### 2.3 Map Gimmicks
1. **Conveyor Belts**:
   - **Structure**: Map array `gimmicks: Map<string, { type: 'CONVEYOR', dir: { x: number, y: number } }>` on specified corridors (e.g. middle horizontal corridor row 6, cols 3–11).
   - **Push Physics**: In `updatePlayerMovement()` and bomb sliding loop, any entity whose center tile matches a conveyor tile receives an additive velocity vector:
     `player.x += dir.x * beltSpeed * (delta / 1000)` (e.g. `beltSpeed = 60 px/s`).
   - **Bomb Interaction**: Bombs placed on conveyor belts smoothly travel down the belt until hitting the end of the track or an obstacle.

2. **Teleport Portals (Warp Pads)**:
   - **Structure**: Two paired portal tiles, e.g. Portal Alpha at `(2, 2)` and Portal Beta at `(10, 12)`.
   - **Trigger**: When player or bomb center is within 12px of portal center and `portalCooldown <= 0`:
     - Teleport entity instantly to destination portal center.
     - Play swirl scale tween (shrink to 0.2, translate, expand back to 1.0).
     - Set `teleportCooldown = 1200ms` on entity to prevent infinite back-and-forth oscillation.

### 2.4 React <-> Phaser Real-Time Bridge
To cleanly separate concerns without polling or performance degradation:

```
┌─────────────────────────────────────────────────────────────┐
│                       GameScene.ts                          │
│                                                             │
│  - Collects Item / Places Bomb / Takes Damage / Uses Skill │
│  - Emits: this.game.events.emit('stats-update', stats)     │
│  - Emits: this.game.events.emit('skill-cooldown', cd)      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Phaser.Events.EventEmitter
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    BombermanGame.tsx                        │
│                                                             │
│  - game.events.on('stats-update', (stats) => setStats(...)) │
│  - Clean listener cleanup on unmount                        │
│  - Renders Arcade HUD (Bomb, Fire, Speed, Skills, Items)    │
└─────────────────────────────────────────────────────────────┘
```

#### Shared Interface Specification
```typescript
export interface PlayerStats {
  speed: number;
  speedLevel: number;        // 1 to 5
  maxBombs: number;          // 1 to 8
  activeBombs: number;       // Current placed on board
  bombPower: number;         // 2 to 8 (blast radius in tiles)
  hasKick: boolean;          // Bomb kick unlocked
  hasShield: boolean;        // Shield active
  dashCooldownRemaining: number; // 0 = ready, > 0 = ms left
  itemsCollected: {
    speedUp: number;
    bombUp: number;
    fireUp: number;
    kick: number;
    shield: number;
  };
  score: number;
  isGameOver: boolean;
}
```

#### HUD UI Elements in `BombermanGame.tsx`:
1. **Primary Stat Gauges** (Arcade Bezel Top):
   - 💣 **BOMBS**: Badge showing `activeBombs / maxBombs` with visual bomb icons.
   - 🔥 **FIRE POWER**: Badge showing `Lv. {bombPower}` with flame color gradation.
   - ⚡ **SPEED**: Badge showing `{speed} px/s (Lv. {speedLevel})`.
2. **Skill Indicators**:
   - 💨 **DASH**: Circular/pill progress meter showing `READY` or countdown sweep.
   - 👟 **KICK**: Glowing icon when unlocked, dimmed when locked.
   - 🛡️ **SHIELD**: Pulsing blue heart/shield icon when active.
3. **Item Collection History**:
   - Micro-badges showing collected item counts across the match (`+3 💣`, `+2 🔥`, `+2 ⚡`).
4. **Mobile Controls Extension**:
   - Add secondary touch buttons: `[DASH]` (blue circular button) and `[SKILL]` alongside the main `[BOMB]` button.

---

## 3. Caveats

1. **Multi-Agent Coordination & Code Boundaries**:
   - `explorer_mech_anim` is investigating directional player animations and sprite sheets.
   - `explorer_mech_ai` is investigating enemy bomb placement and overhead name tags.
   - Workers must ensure that player velocity modifications (conveyor belts, dash, speed upgrades) do not disrupt the corner-sliding logic in `updatePlayerMovement()` or sprite directional flips (`setFlipX`).
2. **Enemy Bombs vs Player Bombs**:
   - If enemies can place bombs (R2), `GameScene.ts` must track bomb ownership (`bomb.setData('owner', 'player' | 'enemy')`).
   - The HUD's `activeBombs` counter must ONLY count bombs where `owner === 'player'`.
3. **Map Gimmick Passability**:
   - Conveyor belts and portals must be treated as `TILE_EMPTY` (passable) by `pathfinding.ts` so enemies can navigate through them naturally without getting stuck.
4. **Read-Only Scope**:
   - As an explorer subagent, no source code was modified. Implementation must be carried out by designated worker agents upon user/parent approval.

---

## 4. Conclusion

### Summary of Solution
1. **Item Drop System**:
   - Integrate `spawnItem(row, col)` into `destroyBlock()` with 45% drop rate.
   - Core power-ups: Speed Up (+25 px/s, cap 250), Bomb Up (+1 bomb, cap 8), Fire Up (+1 radius, cap 8).
   - 600ms explosion grace period to prevent self-destruction upon block crumble.
   - Procedural canvas textures ensure 100% reliable rendering without asset dependencies.
2. **Skills & Gimmicks**:
   - Bomb Kick enables sliding bombs into enemies/obstacles upon contact.
   - Dash skill provides 350 px/s sprint burst with i-frames on 3.5s cooldown.
   - Shield absorbs 1 lethal explosion or enemy attack.
   - Conveyor belts apply constant 60 px/s drift to players and bombs.
   - Teleport portals provide bidirectional transit between arena quadrants.
3. **React <-> Phaser Bridge & HUD**:
   - Decoupled `Phaser.Events.EventEmitter` bridge emitting `stats-update`, `item-collected`, and `skill-cooldown`.
   - Rich retro arcade HUD in `BombermanGame.tsx` displaying real-time gauges for bombs, fire power, speed, active skills, and item counters.
   - Mobile touch layout expanded to support Dash and Skill interactions.

---

## 5. Verification Method

### 5.1 Deterministic Simulation Test Suite
Workers should create `tests/gameplay_mechanics.test.mjs` verifying:
1. **Drop Rate Distribution**:
   - Run 10,000 block destructions; verify total drops fall within `45% ± 2%`.
   - Verify weight proportions: Bomb Up ~40%, Fire Up ~40%, Speed Up ~20%.
2. **Stat Clamping Invariants**:
   - Collecting 10 Speed Ups clamps strictly at `250 px/s`.
   - Collecting 10 Bomb Ups clamps strictly at `8 bombs`.
   - Collecting 10 Fire Ups clamps strictly at `8 radius`.
3. **Explosion Protection Timing**:
   - Bomb exploding at `t = 100ms` does not destroy item spawned at `t = 0ms` (within 600ms grace window).
   - Bomb exploding at `t = 800ms` successfully destroys item.
4. **Bomb Kick Vector Mathematics**:
   - Player at `(1, 1)` moving right into bomb at `(1, 2)` sets bomb velocity `(+300, 0)`.
   - Sliding bomb terminates and snaps to tile center when hitting wall at `(1, 4)`.
5. **Conveyor Belt & Portal Integration**:
   - Entity on conveyor receives designated drift velocity.
   - Portal warp teleports entity to paired coordinates and sets debounce timer.
6. **Bridge Event Emitter Payload**:
   - `stats-update` payload conforms strictly to `PlayerStats` interface.

### 5.2 Build & Verification Commands
```bash
# 1. Run all unit tests
npm test

# 2. Run ESLint
npm run lint

# 3. Compile Next.js production build
npm run build
```
Acceptance criteria: All test suites pass with 100% success, 0 lint warnings/errors, and `npm run build` exits with code 0.
