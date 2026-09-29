# Physics & Collision Audit Handoff Report

**Role**: Physics & Collision Auditor  
**Date**: 2026-09-29T16:18:00Z  
**Target Directory**: `/Users/user/src/bomberman`  
**Working Directory**: `/Users/user/src/bomberman/.agents/teamwork/explorer_inspect_physics_replace`

---

## Executive Summary & Defect Inventory

An exhaustive physical inspection of the Bomberman game physics and collision engine was conducted across six domains:
1. Corner sliding & corridor alignment
2. Physics body invariant guards & scale tween desynchronization
3. Explosion raycasting, wall clipping, and blast propagation
4. Bomb kicking, obstacle detection, and entity collision resolution
5. Conveyor belt drift, AABB wall bounds, and gimmick interactions
6. Boundary clamping, coordinate conversions, and world bounds

While existing suites pass (644/644 tests), the audit revealed **3 critical physical defects**, **4 moderate edge-case glitches**, and **2 architectural inconsistencies** that evade current tests because existing tests evaluate static AABBs or mock bodies with manual coordinate overrides rather than live Phaser Arcade Body behavior.

| Defect ID | Severity | Location | Summary |
|---|---|---|---|
| **PHYS-REV-01** | **CRITICAL** | `src/game/entities/BaseEntity.ts:35-48` | `applyPhysicsBodyInvariantGuard` overrides `updateBounds` without syncing `this.transform.x/y` from `gameObject.x/y`. Direct position updates (teleports, centering snaps) leave the physics body frozen at stale coordinates (proven 100px+ desync). |
| **PHYS-REV-02** | **CRITICAL** | `src/game/GameScene.ts:2754-2776` | Explosions lack `applyPhysicsBodyInvariantGuard`. The 1.35x/1.2x scale bloom tween expands the body from 36x36 to 48.6px, destroying the 2px inset and causing diagonal wall/pillar clipping. |
| **PHYS-REV-03** | **CRITICAL** | `src/game/GameScene.ts:2336-2370` | Bombs lack `applyPhysicsBodyInvariantGuard`. The 4-phase pulsing tween scales up to 1.32x, expanding the 32x32 body to 42.24px (exceeding 40px corridors) and snagging entities in adjacent lanes. |
| **PHYS-REV-04** | **MODERATE** | `src/game/GameScene.ts:1678-1706` | Conveyor drift does not check for existing bombs on the target tile, permitting multiple bombs to be pushed into the exact same coordinates. |
| **PHYS-REV-05** | **MODERATE** | `src/game/GameScene.ts:1022-1030` | Sliding bombs explode on enemies, but lack overlap resolution for Allies and Neutrals; bombs continue moving at 300px/s, pushing and jittering against allies. |
| **PHYS-REV-06** | **MODERATE** | `src/game/GameScene.ts:3431-3450` | `warpPlayer` sets `setPosition` without `body.reset()` or `setVelocity(0,0)`, and does not register on bombs on the destination portal, causing collision ejection. |
| **PHYS-REV-07** | **MODERATE** | `src/game/GameScene.ts:271-280` | `OverheadUIManager` clamps horizontal offsets to `[20, 580]`, but vertical offsets (`offsetsY`) are completely unclamped, pushing labels to `y = -16px` (offscreen). |
| **PHYS-REV-08** | **LOW** | `src/components/BombermanGame.tsx:440` | Arcade Physics world bounds default to 800x600 (canvas size) rather than 600x520 (arena size), allowing wall-passing entities (e.g. PetDrone) to exit the arena grid. |
| **PHYS-REV-09** | **LOW** | `src/game/entities/BaseEntity.ts:255,276` | Visual squash/stretch in `BaseEntity.updateEntity` hardcodes 1.0 base scale, causing `TankEnemy` (1.2) and `CritterNPC` (0.8) to visually pop to 1.0 during walk/idle cycles. |

---

## 1. Observation

### Observation 1: Invariant Guard Transform Desynchronization
In `/Users/user/src/bomberman/src/game/entities/BaseEntity.ts`, lines 19-48:
```ts
export function applyPhysicsBodyInvariantGuard(
  sprite: Phaser.Physics.Arcade.Sprite,
  targetWidth: number = 24,
  targetHeight: number = 24,
  offsetX: number = 8,
  offsetY: number = 8
): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body | undefined;
  if (!body) return;
  body.setSize(targetWidth, targetHeight).setOffset(offsetX, offsetY);
  const fixedHalfW = targetWidth / 2;
  const fixedHalfH = targetHeight / 2;
  const fixedRelX = offsetX - 20;
  const fixedRelY = offsetY - 20;

  const mutableBody = body as unknown as MutableArcadeBody;
  mutableBody.updateBounds = function(this: MutableArcadeBody) {
    this.width = targetWidth;
    this.height = targetHeight;
    this.halfWidth = fixedHalfW;
    this.halfHeight = fixedHalfH;
    this.updateCenter();
  };
  mutableBody.updateFromGameObject = function(this: MutableArcadeBody) {
    this.updateBounds();
    this.position.x = this.transform.x + fixedRelX;
    this.position.y = this.transform.y + fixedRelY;
    this.updateCenter();
  };
}
```
In Phaser 3 (`node_modules/phaser/src/physics/arcade/Body.js`, lines 972-1001), the original `updateBounds` synchronizes `transform`:
```js
        transform.x = sprite.x;
        transform.y = sprite.y;
        transform.rotation = sprite.angle;
        transform.scaleX = sprite.scaleX;
        transform.scaleY = sprite.scaleY;
```
By replacing `updateBounds` without copying `sprite.x` and `sprite.y` into `this.transform.x` and `this.transform.y`, any position change made directly to `sprite.x` or `sprite.y` (e.g. `this.player.y = rowCenterY`, `warpPlayer`, or teleports) leaves `this.transform` stale.
When `updateFromGameObject()` is subsequently called by `preUpdate()`, `this.position.x` and `this.position.y` are computed from stale `this.transform.x` and `this.transform.y`.

**Empirical Tool Execution & Result**:
Executing a test script where `sprite.x = 200; sprite.y = 200; sprite.body.updateFromGameObject();` was executed under `applyPhysicsBodyInvariantGuard`:
```
Initial pos: {"x":80,"y":80} center: {"x":100,"y":100}
After moving sprite.x=200, sprite.y=200:
Body pos: {"x":88,"y":88} Body center: {"x":100,"y":100}
```
The physics body remained frozen at `(100, 100)` despite the sprite being moved to `(200, 200)`.

### Observation 2: Explosions Bloom Beyond Tile Boundary & Clip Pillars
In `/Users/user/src/bomberman/src/game/GameScene.ts`, lines 2750-2776:
```ts
    const exp = this.explosions.create(x, y, 'explosion') as Phaser.Physics.Arcade.Sprite;
    exp.setDepth(RENDER_DEPTH.EXPLOSIONS);
    exp.setData('owner', owner);

    // PHYS-04: Inset hitbox by 2px on all sides (36x36 at offset 2,2) to eliminate diagonal corner leakage
    (exp.body as Phaser.Physics.Arcade.Body)?.setSize(36, 36).setOffset(2, 2);
...
    // Explosive bloom easing: pop in with easeOut, then rapid fade
    exp.setScale(0.7);
    this.tweens.add({
      targets: exp,
      scaleX: isCenter ? 1.35 : 1.2,
      scaleY: isCenter ? 1.35 : 1.2,
      alpha: { from: 1, to: 0.1 },
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => {
        exp.destroy();
      },
    });
```
`applyPhysicsBodyInvariantGuard` is NEVER called on `exp`.
In Phaser 3 Arcade Physics, `body.updateBounds` scales `width` and `height` by `scaleX` and `scaleY`.
At `scaleX = 1.35`, `body.width = 36 * 1.35 = 48.6px`.
Top-left offset: `position.x = transform.x + 1.35 * (2 - 20) = transform.x - 24.3px`.
Right edge: `transform.x - 24.3 + 48.6 = transform.x + 24.3px`.
On a 40px grid tile (half-width 20px), the hitbox extends `24.3 - 20 = 4.3px` outside the tile into adjacent solid walls and corner pillars.
In `tests/bomb_lifecycle.test.mjs` (lines 370-410), PHYS-04 was tested against a static 36x36 AABB `[left: 82, right: 118]`. With the live 1.35x tween, `right = 124.3 > 118`, overlapping the corner entity at `left: 118` and penetrating the pillar.

### Observation 3: Bomb Hitbox Expansion During Pulse Tween
In `/Users/user/src/bomberman/src/game/GameScene.ts`, lines 2334-2370:
```ts
    const bomb = this.bombs.create(centerX, centerY, 'bomb') as Phaser.Physics.Arcade.Sprite;
    bomb.setDepth(RENDER_DEPTH.BOMBS);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setSize(32, 32).setOffset(4, 4);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);
...
    const tweenChain = this.tweens.chain({
      targets: bomb,
      tweens: [
...
        {
          scaleX: 1.32,
          scaleY: 1.12,
          angle: 3.5,
```
The bomb body is configured as 32x32 at offset (4, 4).
However, `applyPhysicsBodyInvariantGuard` is NOT applied to bombs in `placeBomb` (line 2334), `spawnEnemyBomb` (line 2440), or `spawnAllyBomb` (line 2539).
When Phase 3 tween reaches `scaleX = 1.32`:
`width = 32 * 1.32 = 42.24px > 40px` (corridor width).
Hitbox right edge reaches `centerX + 21.12px > 20px`, protruding 1.12px beyond the corridor tile. Entities walking in perpendicular adjacent corridors collide with the bomb.

### Observation 4: Conveyor Belt Bomb Stacking
In `/Users/user/src/bomberman/src/game/GameScene.ts`, lines 1678-1706:
```ts
        const bBelt = this.conveyors.find((c) => c.row === bRow && c.col === bCol);
        if (bBelt) {
          const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
          const nextX = bomb.x + bBelt.dirX * drift;
          const nextY = bomb.y + bBelt.dirY * drift;

          // Leading edge of 32x32 bomb hitbox (radius 16)
          const leadX = nextX + bBelt.dirX * 16;
          const leadY = nextY + bBelt.dirY * 16;
          const leadCol = Math.floor(leadX / TILE_SIZE);
          const leadRow = Math.floor(leadY / TILE_SIZE);
...
          const canMove =
            leadRow >= 0 && leadRow < ROWS && leadCol >= 0 && leadCol < COLS &&
            this.map[leadRow]?.[leadCol] === TILE_EMPTY &&
            this.map[Math.floor((leadY + perpY) / TILE_SIZE)]?.[Math.floor((leadX + perpX) / TILE_SIZE)] === TILE_EMPTY &&
            this.map[Math.floor((leadY - perpY) / TILE_SIZE)]?.[Math.floor((leadX - perpX) / TILE_SIZE)] === TILE_EMPTY;

          if (canMove) {
            bomb.x = nextX;
            bomb.y = nextY;
          }
        }
```
While `canMove` checks `this.map === TILE_EMPTY`, it does NOT check `this.bombs` for existing bombs. If two bombs exist on the conveyor, Bomb A drifts into Bomb B, stacking onto the same coordinates.

### Observation 5: Sliding Bomb Collision Resolution Gap
In `/Users/user/src/bomberman/src/game/GameScene.ts`, lines 1022-1030:
```ts
    // Sliding bomb hits enemy
    this.physics.add.overlap(this.bombs, this.enemies, (bombObj, enemyObj) => {
      const bomb = bombObj as Phaser.Physics.Arcade.Sprite;
      const enemy = enemyObj as BaseEntity;
      if (bomb.active && bomb.getData('isSliding') && enemy.active) {
        const bCol = Math.floor(bomb.x / TILE_SIZE);
        const bRow = Math.floor(bomb.y / TILE_SIZE);
        this.explodeBomb(bomb, bRow, bCol);
      }
    });
```
There is no corresponding overlap handler for `this.allies` or `this.neutrals`.
Lines 958 and 985 register colliders:
```ts
this.physics.add.collider(this.neutrals, this.bombs, ...);
this.physics.add.collider(this.allies, this.bombs, ...);
```
When a sliding bomb hits an ally, the collider stops penetration, but does not clear `isSliding` or zero velocity. The bomb remains sliding at 300px/s, pushing or jittering against the ally.

### Observation 6: Teleport Warp Deficiencies
In `/Users/user/src/bomberman/src/game/GameScene.ts`, lines 3431-3450:
```ts
  private warpPlayer(toRow: number, toCol: number) {
    this.portalCooldown = PORTAL_COOLDOWN_MS;
    const targetX = toCol * TILE_SIZE + TILE_SIZE / 2;
    const targetY = toRow * TILE_SIZE + TILE_SIZE / 2;

    this.cameras.main.flash(100, 56, 189, 248, false);

    this.tweens.add({
      targets: this.player,
      scaleX: 0.1,
      scaleY: 0.1,
      duration: 100,
      yoyo: true,
      ease: 'Back.easeIn',
      onYoyo: () => {
        if (this.player && this.player.active) {
          this.player.setPosition(targetX, targetY);
        }
      },
    });
  }
```
1. `this.player.setVelocity(0, 0)` is omitted.
2. `(this.player.body as Phaser.Physics.Arcade.Body)?.reset(targetX, targetY)` is omitted. `body.prev` retains the source portal position.
3. If a bomb occupies Portal B, `populateBombIgnoringColliders` is not called for the player. The solid bomb collider executes separation ejection.

### Observation 7: Unclamped Vertical Offsets in Overhead UI
In `/Users/user/src/bomberman/src/game/GameScene.ts`, lines 271-280:
```ts
    // Clamp horizontal offsets to arena boundaries
    for (let i = 0; i < active.length; i++) {
      const entity = active[i];
      const intendedX = entity.x + offsetsX[i];
      if (intendedX < 20) {
        offsetsX[i] = 20 - entity.x;
      } else if (intendedX > 600 - 20) {
        offsetsX[i] = (600 - 20) - entity.x;
      }
    }
```
Horizontal offsets are clamped to `[20, 580]`. Vertical offsets (`offsetsY[i]`) are never clamped. When entities in row 1 receive `-14px` staggering, `entity.y - 22 + oy` drops below 0px (offscreen).

---

## 2. Logic Chain

1. **Transform Desynchronization Causality**:
   - `applyPhysicsBodyInvariantGuard` assigns custom implementations to `mutableBody.updateBounds` and `mutableBody.updateFromGameObject`.
   - Neither implementation updates `this.transform.x = this.gameObject.x` or `this.transform.y = this.gameObject.y`.
   - In Arcade Physics, `body.preUpdate()` invokes `updateFromGameObject()`, which assigns `this.position.x = this.transform.x + fixedRelX`.
   - Consequently, when game logic repositions a sprite directly (`this.player.x = colCenterX`, `setPosition(targetX, targetY)`), `this.transform` retains the old coordinates.
   - The body position is immediately reverted to the old coordinates on the subsequent physics preUpdate, producing hitbox freeze or micro-jitter.

2. **Explosion Hitbox Bloom Causality**:
   - PHYS-04 reduced explosion bodies to 36x36 with offset (2, 2), leaving a 2px margin inside 40px tiles to prevent corner leakage.
   - The juice milestone introduced an explosive bloom tween (`scaleX: 1.35, scaleY: 1.35`).
   - Because `applyPhysicsBodyInvariantGuard` was not applied to explosions, Arcade Physics `updateBounds` recomputed `body.width = 36 * 1.35 = 48.6px`.
   - A 48.6px body extends 4.3px beyond the tile boundary in all four directions.
   - Across diagonal corners, the expanded body intersects entities in perpendicular corridors, invalidating the corner pillar protection of PHYS-04.

3. **Bomb Hitbox Expansion Causality**:
   - Bombs are initialized with 32x32 hitboxes.
   - The 4-phase pulse tween oscillates `scaleX` between 0.80 and 1.32.
   - Without the invariant guard, Arcade Physics scales the body up to 42.24px.
   - Corridors are 40px wide; a 42.24px body overlaps into adjacent tiles, creating phantom collision walls.

4. **Conveyor Stacking Causality**:
   - Conveyor drift checks `this.map[leadRow]?.[leadCol] === TILE_EMPTY` before updating `bomb.x`.
   - Active bombs are entities in `this.bombs`, not tile codes in `this.map`.
   - Therefore, `canMove` returns true even when another bomb is directly ahead, allowing conveyor belts to crush multiple bombs onto a single tile.

---

## 3. Caveats

1. **Zero-GC Compliance**: Any remediation must avoid heap allocations in `updateBounds`, `updateFromGameObject`, or per-frame conveyor checks. Object pools and typed arrays must not be bypassed.
2. **Arcade Physics vs Procedural Movement**: Bombs and conveyor movements combine Phaser physics velocities with procedural `setPosition` calls. Care must be taken so that setting positions does not produce velocity spikes in Arcade integration.
3. **AI Pathfinding Safety**: Enemies rely on `ZeroGCPathfinder` and `isTileInBlastRange`. If bomb or explosion hitboxes are locked to 32x32 and 36x36 respectively, pathfinding safety calculations will match physical reality 1:1.

---

## 4. Conclusion

The physics and collision architecture has strong foundations (zero-GC pathfinder, 2-phase corner rounding, AABB probe bumpers), but suffers from three critical invariant breakdowns:
1. **Hitbox desync on direct position changes** due to missing `transform.x/y` sync in `applyPhysicsBodyInvariantGuard`.
2. **Hitbox swelling on explosions** (up to 48.6px) due to missing invariant guard on explosion sprites with scale tweens.
3. **Hitbox swelling on bombs** (up to 42.24px) due to missing invariant guard on pulsing bombs.

Remediating these three issues plus the conveyor and warp edge cases will achieve a robust, 100% physically invariant simulation.

---

## 5. Verification Method

### A. Automatic Regression Test
Run the full test suite to ensure no regressions:
```bash
npm test
```

### B. Specific Physical Verification Test Cases
Add the defensive test suite below to verify:
1. `applyPhysicsBodyInvariantGuard` tracks `sprite.x` and `sprite.y` mutations without freeze.
2. Bomb hitboxes remain exactly 32x32 at offset (4, 4) during all 4 phases of scale tweens (`[0.80, 1.32]`).
3. Explosion hitboxes remain exactly 36x36 at offset (2, 2) during bloom tweens (`[0.70, 1.35]`), preventing diagonal leakage behind pillars.
4. Conveyor drift rejects movement when another bomb occupies the destination tile.
5. `OverheadUIManager` clamps vertical offsets to `[16, 504]`.

---

## Concrete Proposed Code Changes

### Patch 1: Fix `applyPhysicsBodyInvariantGuard` in `src/game/entities/BaseEntity.ts`

```ts
// File: src/game/entities/BaseEntity.ts (lines 19-48)
export function applyPhysicsBodyInvariantGuard(
  sprite: Phaser.Physics.Arcade.Sprite,
  targetWidth: number = 24,
  targetHeight: number = 24,
  offsetX: number = 8,
  offsetY: number = 8
): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body | undefined;
  if (!body) return;
  body.setSize(targetWidth, targetHeight).setOffset(offsetX, offsetY);
  const fixedHalfW = targetWidth / 2;
  const fixedHalfH = targetHeight / 2;
  const baseOriginX = (sprite as { baseDisplayOriginX?: number }).baseDisplayOriginX ?? sprite.displayOriginX ?? 20;
  const baseOriginY = (sprite as { baseDisplayOriginY?: number }).baseDisplayOriginY ?? sprite.displayOriginY ?? 20;
  const fixedRelX = offsetX - baseOriginX;
  const fixedRelY = offsetY - baseOriginY;

  const mutableBody = body as unknown as MutableArcadeBody;
  mutableBody.updateBounds = function(this: MutableArcadeBody) {
    const go = (this as unknown as { gameObject?: Phaser.GameObjects.GameObject }).gameObject as Phaser.Physics.Arcade.Sprite | undefined ?? sprite;
    if (go) {
      this.transform.x = go.x;
      this.transform.y = go.y;
    }
    this.width = targetWidth;
    this.height = targetHeight;
    this.halfWidth = fixedHalfW;
    this.halfHeight = fixedHalfH;
    this.updateCenter();
  };
  mutableBody.updateFromGameObject = function(this: MutableArcadeBody) {
    const go = (this as unknown as { gameObject?: Phaser.GameObjects.GameObject }).gameObject as Phaser.Physics.Arcade.Sprite | undefined ?? sprite;
    if (go) {
      this.transform.x = go.x;
      this.transform.y = go.y;
    }
    this.updateBounds();
    this.position.x = this.transform.x + fixedRelX;
    this.position.y = this.transform.y + fixedRelY;
    this.updateCenter();
  };
}
```

### Patch 2: Guard Bomb Physics Bodies Against Scale Tweens (`GameScene.ts`)

In `placeBomb` (line 2336), `spawnEnemyBomb` (line 2442), and `spawnAllyBomb` (line 2539):
```ts
// Replace:
(bomb.body as Phaser.Physics.Arcade.Body)?.setSize(32, 32).setOffset(4, 4);
// With:
applyPhysicsBodyInvariantGuard(bomb, 32, 32, 4, 4);
```

### Patch 3: Guard Explosion Physics Bodies Against Bloom Tweens (`GameScene.ts`)

In `spawnExplosion` (line 2755) and `executeNuclearBarrage` (line 3357):
```ts
// Replace:
(exp.body as Phaser.Physics.Arcade.Body)?.setSize(36, 36).setOffset(2, 2);
// With:
applyPhysicsBodyInvariantGuard(exp, 36, 36, 2, 2);
```

### Patch 4: Prevent Bomb Stacking on Conveyor Belts (`GameScene.ts`)

In `update()` (lines 1693-1698):
```ts
          let hasOtherBombAtLead = false;
          this.bombs.getChildren().forEach((other) => {
            const ob = other as Phaser.Physics.Arcade.Sprite;
            if (ob.active && ob !== bomb) {
              const obr = Math.floor(ob.y / TILE_SIZE);
              const obc = Math.floor(ob.x / TILE_SIZE);
              if (obr === leadRow && obc === leadCol) {
                hasOtherBombAtLead = true;
              }
            }
          });

          const canMove =
            !hasOtherBombAtLead &&
            leadRow >= 0 && leadRow < ROWS && leadCol >= 0 && leadCol < COLS &&
            this.map[leadRow]?.[leadCol] === TILE_EMPTY &&
            this.map[Math.floor((leadY + perpY) / TILE_SIZE)]?.[Math.floor((leadX + perpX) / TILE_SIZE)] === TILE_EMPTY &&
            this.map[Math.floor((leadY - perpY) / TILE_SIZE)]?.[Math.floor((leadX - perpX) / TILE_SIZE)] === TILE_EMPTY;
```

### Patch 5: Resolve Sliding Bombs Hitting Allies/Neutrals (`GameScene.ts`)

Add collision/overlap stop handler for sliding bombs hitting allies and neutrals:
```ts
    this.physics.add.overlap(this.bombs, this.allies, (bombObj, allyObj) => {
      const bomb = bombObj as Phaser.Physics.Arcade.Sprite;
      if (bomb.active && bomb.getData('isSliding')) {
        const bCol = Math.floor(bomb.x / TILE_SIZE);
        const bRow = Math.floor(bomb.y / TILE_SIZE);
        bomb.setVelocity(0, 0);
        bomb.setData('isSliding', false);
        (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);
        bomb.setPosition(bCol * TILE_SIZE + TILE_SIZE / 2, bRow * TILE_SIZE + TILE_SIZE / 2);
      }
    });
```

### Patch 6: Warp Player Clean Reset & Bomb Ignored Registration (`GameScene.ts`)

In `warpPlayer` (lines 3445-3450):
```ts
      onYoyo: () => {
        if (this.player && this.player.active) {
          this.player.setPosition(targetX, targetY);
          this.player.setVelocity(0, 0);
          (this.player.body as Phaser.Physics.Arcade.Body)?.reset(targetX, targetY);

          // If a bomb exists at the destination portal, add player to its ignoringColliders
          this.bombs.getChildren().forEach((child) => {
            const b = child as Phaser.Physics.Arcade.Sprite;
            if (b.active && Math.floor(b.x / TILE_SIZE) === toCol && Math.floor(b.y / TILE_SIZE) === toRow) {
              const ignoring = b.getData('ignoringColliders') as Set<Phaser.GameObjects.GameObject> | undefined;
              if (ignoring) {
                ignoring.add(this.player);
              }
            }
          });
        }
      },
```

### Patch 7: Vertical Offsets Clamping in `OverheadUIManager` (`GameScene.ts`)

In `OverheadUIManager.update()` lines 271-280:
```ts
    // Clamp horizontal and vertical offsets to arena boundaries
    for (let i = 0; i < active.length; i++) {
      const entity = active[i];
      const intendedX = entity.x + offsetsX[i];
      if (intendedX < 20) {
        offsetsX[i] = 20 - entity.x;
      } else if (intendedX > 600 - 20) {
        offsetsX[i] = (600 - 20) - entity.x;
      }

      const intendedY = entity.y - 22 + offsetsY[i];
      if (intendedY < 16) {
        offsetsY[i] = 16 - (entity.y - 22);
      } else if (intendedY > 520 - 16) {
        offsetsY[i] = (520 - 16) - (entity.y - 22);
      }
    }
```

---

## Recommended Defensive Test Cases

The following test suite should be added to `tests/unit/physics_audit_invariants.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPhysicsBodyInvariantGuard } from '../../src/game/entities/BaseEntity.ts';

test('AUDIT-PHYS-01: applyPhysicsBodyInvariantGuard tracks direct position mutations', () => {
  const sprite = {
    x: 100,
    y: 100,
    displayOriginX: 20,
    displayOriginY: 20,
    body: {
      width: 40,
      height: 40,
      halfWidth: 20,
      halfHeight: 20,
      offset: { x: 0, y: 0 },
      position: { x: 80, y: 80 },
      center: { x: 100, y: 100 },
      transform: { x: 100, y: 100 },
      setSize(w, h) { this.width = w; this.height = h; return this; },
      setOffset(ox, oy) { this.offset.x = ox; this.offset.y = oy; return this; },
      updateCenter() { this.center.x = this.position.x + this.halfWidth; this.center.y = this.position.y + this.halfHeight; },
      updateBounds() {},
      updateFromGameObject() {},
    },
  };
  sprite.body.gameObject = sprite;

  applyPhysicsBodyInvariantGuard(sprite, 24, 24, 8, 8);

  // Directly move sprite to a new tile center
  sprite.x = 220;
  sprite.y = 260;
  sprite.body.updateFromGameObject();

  assert.equal(sprite.body.center.x, 220, 'Body center X must follow sprite.x');
  assert.equal(sprite.body.center.y, 260, 'Body center Y must follow sprite.y');
  assert.equal(sprite.body.width, 24, 'Body width must remain 24');
  assert.equal(sprite.body.height, 24, 'Body height must remain 24');
});

test('AUDIT-PHYS-02: Explosion body size remains 36x36 at 1.35x scale bloom', () => {
  const exp = {
    x: 100,
    y: 60,
    scaleX: 1.0,
    scaleY: 1.0,
    displayOriginX: 20,
    displayOriginY: 20,
    body: {
      width: 40,
      height: 40,
      halfWidth: 20,
      halfHeight: 20,
      offset: { x: 0, y: 0 },
      position: { x: 80, y: 40 },
      center: { x: 100, y: 60 },
      transform: { x: 100, y: 60 },
      setSize(w, h) { this.width = w; this.height = h; return this; },
      setOffset(ox, oy) { this.offset.x = ox; this.offset.y = oy; return this; },
      updateCenter() { this.center.x = this.position.x + this.halfWidth; this.center.y = this.position.y + this.halfHeight; },
      updateBounds() {},
      updateFromGameObject() {},
    },
  };
  exp.body.gameObject = exp;

  applyPhysicsBodyInvariantGuard(exp, 36, 36, 2, 2);

  // Bloom to 1.35x
  exp.scaleX = 1.35;
  exp.scaleY = 1.35;
  exp.body.updateFromGameObject();

  assert.equal(exp.body.width, 36, 'Explosion width must stay 36 despite 1.35x bloom');
  assert.equal(exp.body.height, 36, 'Explosion height must stay 36 despite 1.35x bloom');
  assert.equal(exp.body.position.x + exp.body.width, 118, 'Explosion right edge must not exceed 118 (no pillar penetration)');
});

test('AUDIT-PHYS-03: Bomb body size remains 32x32 at 1.32x pulse tween', () => {
  const bomb = {
    x: 180,
    y: 180,
    scaleX: 1.0,
    scaleY: 1.0,
    displayOriginX: 20,
    displayOriginY: 20,
    body: {
      width: 40,
      height: 40,
      halfWidth: 20,
      halfHeight: 20,
      offset: { x: 0, y: 0 },
      position: { x: 160, y: 160 },
      center: { x: 180, y: 180 },
      transform: { x: 180, y: 180 },
      setSize(w, h) { this.width = w; this.height = h; return this; },
      setOffset(ox, oy) { this.offset.x = ox; this.offset.y = oy; return this; },
      updateCenter() { this.center.x = this.position.x + this.halfWidth; this.center.y = this.position.y + this.halfHeight; },
      updateBounds() {},
      updateFromGameObject() {},
    },
  };
  bomb.body.gameObject = bomb;

  applyPhysicsBodyInvariantGuard(bomb, 32, 32, 4, 4);

  // Phase 3 pulse: 1.32x
  bomb.scaleX = 1.32;
  bomb.scaleY = 1.12;
  bomb.body.updateFromGameObject();

  assert.equal(bomb.body.width, 32, 'Bomb width must stay 32 despite 1.32x pulse');
  assert.equal(bomb.body.height, 32, 'Bomb height must stay 32 despite 1.32x pulse');
  assert.equal(bomb.body.position.x + bomb.body.width, 196, 'Bomb right edge must stay within 40px tile (< 200)');
});
```
