# Handoff Report: Lively Enemies & Visual AI State System

**Agent**: `explorer_enemies_refine`  
**Milestone**: Enemy Liveliness & Visual State Refinement  
**Date**: 2026-09-15T01:26:00Z  
**Target Files Analyzed**: `src/game/GameScene.ts`, `src/game/pathfinding.ts`, `tests/ai_pathfinding_stress.test.mjs`, `public/assets/*.png`

---

## 1. Observation

### 1.1 Existing Enemy Architecture & Creation
- **File**: `src/game/GameScene.ts` (Lines 33–63, 343–345, 367–396)
- **Class Structure**:
  - `export class Enemy extends Phaser.Physics.Arcade.Sprite`
  - Constructor: `constructor(scene: Phaser.Scene, x: number, y: number, texture: string = 'enemy', isTracker: boolean = true)`
  - Physics body: `(this.body as Phaser.Physics.Arcade.Body)?.setSize(28, 28).setOffset(6, 6)`.
  - Collision & Depth: `setCollideWorldBounds(true)`, `setDepth(9)`.
  - Group Management: Managed via `this.enemies = this.physics.add.group()` in `GameScene.create()` (line 329).
  - Spawning (lines 367–396): 4 enemies spawned randomly in open floor tiles `[5, ROWS-2] x [5, COLS-2]`. Alternates textures: `isTracker ? 'enemy_tracker' : 'enemy'`.

### 1.2 Unused Enemy Differentiation (`isTracker`)
- **File**: `src/game/GameScene.ts` (Line 35, 51, 54)
- Observation: `public isTracker: boolean` is saved in the constructor (`this.isTracker = isTracker;`), but **is never referenced anywhere else in the entire class or file**!
- Consequence: Both standard enemies (`enemy.png`) and tracker enemies (`enemy_tracker.png`) execute the exact same full-map BFS tracking loop every 350ms, with zero behavioral or visual difference.

### 1.3 Existing AI States & Deficiencies
- **File**: `src/game/GameScene.ts` (Lines 23–28, 81–94)
  ```typescript
  export enum EnemyState {
    TRACKING = 'TRACKING',
    WINDUP = 'WINDUP',
    ATTACK = 'ATTACK',
    COOLDOWN = 'COOLDOWN',
  }
  ```
- Current State Analysis:
  1. `TRACKING` (lines 97–164): Combines pathfinding and movement. If Line of Sight is established or Manhattan distance <= 1, triggers `startWindup`. Otherwise, runs BFS pathfinding every 350ms and moves toward waypoint at `baseSpeed = 75`.
  2. `WINDUP` (lines 196–226): 450ms telegraph. Velocity set to (0, 0), static red tint `0xff2222`.
  3. `ATTACK` (lines 228–263): Dashes along corridor at `chargeSpeed = 200` for max 650ms. Static orange tint `0xffaa00`.
  4. `COOLDOWN` (lines 265–276): 1200ms recovery. Velocity set to (0, 0), static blue tint `0x88bbff`.
- **Deficiencies Identified**:
  - **No `IDLE` state**: Enemies never pause, look around, or rest; they constantly march towards the player even if blocked or far away.
  - **No `PATROL` / `MOVING` (Wander) vs `HUNTING` distinction**: Enemies lack a relaxed wandering state. There is no alert moment when discovering the player.
  - **Zero Animations**: The sprites are static 40x40 PNGs (`enemy.png`, `enemy_tracker.png`). There are no breathing tweens, no walk wobbles, no squash-and-stretch on attack, and no dizzy animations on cooldown.
  - **Lack of Intent Indicators**: No visual symbol (`!`, `⚠️`, `💫`, `...`) appears above the enemy to telegraph alertness, windup, attack, or stun.
  - **Zero Particle Effects**: No dust puffs on walking, no smoke on dashing, and no defeat burst when destroyed.

### 1.4 Critical Corner-Case Bug Observed in Attack Vector
- **File**: `src/game/GameScene.ts` (Lines 208–226), confirmed by `tests/ai_pathfinding_stress.test.mjs` (Lines 495–516):
  ```typescript
  // In startWindup():
  if (er === pr) {
    this.attackDir = { x: Math.sign(pc - ec), y: 0 };
  } else if (ec === pc) {
    this.attackDir = { x: 0, y: Math.sign(pr - er) };
  ...
  ```
  - When enemy and player share the same grid tile (`er === pr && ec === pc`), `pc - ec === 0`.
  - `Math.sign(0)` returns `0`!
  - Result: `attackDir` becomes `{ x: 0, y: 0 }`. In `ATTACK` state, the enemy freezes in place with zero velocity instead of charging towards the player's pixel position.

### 1.5 Enemy Destruction & Cleanup
- **File**: `src/game/GameScene.ts` (Lines 587–592):
  ```typescript
  this.physics.add.overlap(this.enemies, exp, (_expObj, enemyHit) => {
    const target = enemyHit as Phaser.GameObjects.GameObject;
    if (target.active) {
      target.destroy();
    }
  });
  ```
  - `Enemy` currently does not override `destroy()`. If companion indicator game objects or active scene tweens are introduced, they must be cleanly stopped and destroyed to avoid memory leaks.

---

## 2. Logic Chain

### 2.1 State Machine Evolution: 6 Distinct States
To fulfill requirement R2 ("Add distinct states (idle, moving, hunting) with corresponding animations, particle effects, or clear visual intent indicators"), the state machine should be expanded while preserving backward compatibility with `TRACKING`:

| State | Behavior & Trigger | Speed | Visual Indicator | Procedural Animation / Tween | Particle Effect | Tint |
|---|---|---|---|---|---|---|
| **IDLE** | Pauses, scans surroundings (800–1500ms duration). Default when far from player or at patrol stop. | 0 px/s | `...` (soft blue/gray badge) | **Breathing Squash & Stretch**: `scaleY: 0.93..1.0`, `scaleX: 1.07..1.0` (Sine yoyo 500ms) | None | Normal (`0xffffff`) |
| **PATROL** (MOVING) | Wandering open corridors at relaxed pace. Default for `isTracker: false` when player > 5 tiles away. | 55 px/s | Hidden (clean HUD) | **Walking Waddle**: `angle: -6°..+6°` (Sine yoyo 180ms) + slight vertical bob | Footstep dust puff every 250ms (`scene.add.circle`) | Normal (`0xffffff`) |
| **HUNTING** (CHASING) | Alerted! Player spotted (or `isTracker: true`). Fast pursuit via BFS. | 85 px/s | **`!` Alert Mark**: Pops up with `Back.easeOut` bounce, bold gold/red | **Aggressive Sprint**: `angle: -10°..+10°` (Sine yoyo 110ms) | Speed trail dust | Alert glow (`0xffaaaa`) |
| **WINDUP** | Line of Sight in corridor or proximity (<= 1 tile). 450ms telegraph. Locks direction. | 0 px/s | **`⚠️` Warning**: Flashes with attack arrow direction | **Pre-charge Shiver**: Rapid X-jitter `±2.5px` (40ms) + compression `scaleX: 0.88, scaleY: 1.12` | Warning sparks | Flashing red (`0xff2222` ↔ `0xff6666`) |
| **ATTACK** | High-speed dash along corridor for max 650ms or until obstacle impact. | 220 px/s | **`💥` / `⚡` Impact Dash** | **Directional Stretch**: Stretched along charge axis (`scaleX: 1.3, scaleY: 0.8` if horizontal) | Smoke puffs trailing behind every 60ms | Fiery orange (`0xff8800`) |
| **COOLDOWN** | Stunned/dazed after wall collision or dash finish. 1200ms recovery window. | 0 px/s | **`💫` Dizzy Stars**: Continuously rotating 360° above head | **Flattened Pancake**: `scaleY: 0.75, scaleX: 1.2` wobbling back to normal | Impact stars on collision | Stunned blue (`0x88bbff`) |

### 2.2 Companion Indicator Architecture vs Container Physics
- **Decision**: Keep `Enemy extends Phaser.Physics.Arcade.Sprite` and manage a companion `Phaser.GameObjects.Text` indicator object (`this.indicator`), rather than converting `Enemy` into a `Phaser.GameObjects.Container`.
- **Rationale**:
  1. Arcade Physics containers in Phaser 3/4 have well-documented issues with bounding box offset synchronization, collision body child transforms, and static group resolution.
  2. With `Enemy extends Phaser.Physics.Arcade.Sprite`, the physics body (28x28 at offset 6, 6) and all colliders with walls, blocks, bombs, player, and explosions remain 100% stable and intact.
  3. The companion indicator text is positioned above the enemy each frame in `updateAI()` (`this.indicator.setPosition(this.x, this.y - 24)`), giving complete freedom for scaling, bounce, rotation, and visibility control.

### 2.3 Lightweight Particle System without External Assets
- **Decision**: Use `this.scene.add.circle(x, y, radius, color, alpha)` with short tweens for all particle effects.
- **Rationale**:
  - `public/assets/` contains only static PNGs; no particle spritesheets exist.
  - Generating dynamic textures or creating separate Phaser ParticleEmitter managers adds unnecessary overhead.
  - `Phaser.GameObjects.Arc` (`scene.add.circle`) is built-in, GPU-accelerated, lightweight, and auto-destroys cleanly via `onComplete: () => dot.destroy()`.
  - Used for:
    1. Footstep dust puffs during PATROL/HUNTING (radius: 3, cream/white, duration: 220ms).
    2. Smoke puffs during ATTACK charge (radius: 5, orange/smoke, duration: 200ms).
    3. Defeat burst on explosion hit: 6 radial sparks dispersing outward in 300ms.

### 2.4 State Transition & Tween Lifecycle Safety
- To prevent conflicting tweens on sprite properties (`scaleX`, `scaleY`, `angle`, `alpha`):
  1. Provide a `stopStateTweens()` helper:
     ```typescript
     private stopStateTweens() {
       if (this.scene) {
         this.scene.tweens.killTweensOf(this);
         if (this.indicator) {
           this.scene.tweens.killTweensOf(this.indicator);
         }
       }
       this.setScale(1, 1);
       this.setAngle(0);
     }
     ```
  2. In `changeState(newState: EnemyState)`:
     - Check `if (this.aiState === newState) return;`
     - Call `this.stopStateTweens();`
     - Set `this.aiState = newState;`
     - Apply new state visual configurations, indicator texts, and animations.
  3. In `destroy(fromScene?: boolean)`:
     - Call `this.stopStateTweens();`
     - Destroy companion `this.indicator.destroy();`
     - Call `super.destroy(fromScene);`

### 2.5 Normal vs Tracker Enemy AI Differentiation
- **Tracker Enemy (`isTracker: true`)**:
  - Direct threat: Runs BFS pathfinding towards the player globally across the map.
  - Cycles: `HUNTING -> (in range) -> WINDUP -> ATTACK -> COOLDOWN -> HUNTING`.
- **Normal Enemy (`isTracker: false`)**:
  - Local guardian: Checks distance to player.
  - If `manhattan > 5` and no line of sight:
    - Alternates between `IDLE` (pause 1s) and `PATROL` (wanders 1-2 open corridor tiles).
  - If `manhattan <= 5` or line of sight:
    - Pops `!` alert indicator, transitions to `HUNTING`, pursues player!
    - If player retreats > 7 tiles away: loses interest, returns to `IDLE`!

---

## 3. Caveats & Risks

1. **Phaser `flipX` vs `scaleX` Tween Interaction**:
   - In Phaser, `setFlipX(true)` flips the sprite horizontally without changing `scaleX` to negative. However, if a tween explicitly interpolates `scaleX: { from: 1, to: 1.2 }`, it will operate on the magnitude correctly while `flipX` controls horizontal orientation.
   - *Mitigation*: Rely on `this.setFlipX(direction < 0)` for facing direction, and apply tweens strictly on positive scale magnitudes (`scaleX: 1.0..1.2`).
2. **Performance of Concurrent Particle Circles**:
   - Spawning circles every frame would cause garbage collection pressure.
   - *Mitigation*: Rate-limit particle spawns via a timer (e.g., footstep dust every 250ms, charge smoke every 70ms). Total active particles on screen will never exceed 15 at any instant.
3. **Backward Compatibility with Existing Tests**:
   - Existing tests in `tests/ai_pathfinding_stress.test.mjs` test `EnemyState.TRACKING`.
   - *Mitigation*: Keep `EnemyState.TRACKING` as an alias or active state alongside `HUNTING` (e.g. `TRACKING = 'TRACKING'`, `HUNTING = 'HUNTING'`), and ensure all existing state transition paths remain 100% valid.

---

## 4. Conclusion & Concrete Implementation Recommendation

### 4.1 Recommended Changes in `src/game/GameScene.ts`

#### Step A: Enum Extension
```typescript
export enum EnemyState {
  IDLE = 'IDLE',
  PATROL = 'PATROL',
  TRACKING = 'TRACKING', // Backwards-compatible alias for hunting
  HUNTING = 'HUNTING',
  WINDUP = 'WINDUP',
  ATTACK = 'ATTACK',
  COOLDOWN = 'COOLDOWN',
}
```

#### Step B: Enemy Class Properties & Constructor
```typescript
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public aiState: EnemyState = EnemyState.PATROL;
  public isTracker: boolean;

  private stateTimer: number = 0;
  private pathRecalcTimer: number = 0;
  private particleTimer: number = 0;
  private currentPath: GridCoord[] = [];
  private targetTile: GridCoord | null = null;

  private attackDir: { x: number; y: number } = { x: 0, y: 0 };
  private baseSpeed: number = 70;
  private chargeSpeed: number = 220;

  // Visual companion indicator
  private indicator!: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string = 'enemy',
    isTracker: boolean = true
  ) {
    super(scene, x, y, texture);
    this.isTracker = isTracker;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDepth(9);
    (this.body as Phaser.Physics.Arcade.Body)?.setSize(28, 28).setOffset(6, 6);

    // Create intent indicator text above enemy head
    this.indicator = scene.add.text(x, y - 24, '', {
      fontSize: '15px',
      fontStyle: 'bold',
      fontFamily: 'monospace, Arial, sans-serif',
      color: '#FFD700',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.indicator.setOrigin(0.5, 0.5);
    this.indicator.setDepth(15);
    this.indicator.setVisible(false);

    // Initialize initial state
    this.changeState(isTracker ? EnemyState.TRACKING : EnemyState.PATROL);
  }
```

#### Step C: State Transition & Visual Manager (`changeState`)
```typescript
  public changeState(newState: EnemyState) {
    if (this.aiState === newState) return;
    this.stopStateTweens();
    this.aiState = newState;
    this.applyStateVisuals(newState);
  }

  private stopStateTweens() {
    if (this.scene) {
      this.scene.tweens.killTweensOf(this);
      if (this.indicator) {
        this.scene.tweens.killTweensOf(this.indicator);
      }
    }
    this.setScale(1, 1);
    this.setAngle(0);
  }

  private applyStateVisuals(state: EnemyState) {
    if (!this.active || !this.scene) return;

    switch (state) {
      case EnemyState.IDLE:
        this.clearTint();
        this.indicator.setText('...');
        this.indicator.setStyle({ color: '#94a3b8', stroke: '#0f172a', strokeThickness: 2 });
        this.indicator.setVisible(true);
        this.indicator.setScale(1);

        // Breathing squash & stretch
        this.scene.tweens.add({
          targets: this,
          scaleX: 1.07,
          scaleY: 0.93,
          duration: 550,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;

      case EnemyState.PATROL:
        this.clearTint();
        this.indicator.setVisible(false);

        // Walking waddle
        this.scene.tweens.add({
          targets: this,
          angle: { from: -6, to: 6 },
          duration: 170,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;

      case EnemyState.TRACKING:
      case EnemyState.HUNTING:
        this.setTint(this.isTracker ? 0xffbbbb : 0xffddaa);
        this.indicator.setText('!');
        this.indicator.setStyle({ color: '#FFD700', stroke: '#7f1d1d', strokeThickness: 3 });
        this.indicator.setVisible(true);

        // Alert bounce pop-in
        this.indicator.setScale(0);
        this.scene.tweens.add({
          targets: this.indicator,
          scale: 1.15,
          duration: 220,
          ease: 'Back.easeOut',
        });

        // Fast sprint waddle
        this.scene.tweens.add({
          targets: this,
          angle: { from: -10, to: 10 },
          duration: 110,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;

      case EnemyState.WINDUP:
        this.setTint(0xff2222);
        this.indicator.setText('⚠️');
        this.indicator.setStyle({ color: '#ff4444', stroke: '#000000', strokeThickness: 2 });
        this.indicator.setVisible(true);

        // High frequency telegraph shiver & spring compression
        this.scene.tweens.add({
          targets: this,
          scaleX: 0.86,
          scaleY: 1.14,
          duration: 50,
          yoyo: true,
          repeat: -1,
        });
        break;

      case EnemyState.ATTACK:
        this.setTint(0xff8800);
        this.indicator.setText('⚡');
        this.indicator.setVisible(true);

        // Stretched sprint in attack direction
        const isHoriz = Math.abs(this.attackDir.x) > Math.abs(this.attackDir.y);
        this.setScale(isHoriz ? 1.3 : 0.82, isHoriz ? 0.82 : 1.3);
        break;

      case EnemyState.COOLDOWN:
        this.setTint(0x88bbff);
        this.indicator.setText('💫');
        this.indicator.setVisible(true);

        // Dizzy rotating stars
        this.scene.tweens.add({
          targets: this.indicator,
          angle: 360,
          duration: 900,
          repeat: -1,
        });

        // Squashed pancake bounce
        this.scene.tweens.add({
          targets: this,
          scaleX: 1.22,
          scaleY: 0.78,
          duration: 280,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;
    }
  }
```

#### Step D: Attack Vector Bug Fix & Clean Destruction
```typescript
  private startWindup(
    er: number,
    ec: number,
    pr: number,
    pc: number,
    player: Phaser.Physics.Arcade.Sprite
  ) {
    this.changeState(EnemyState.WINDUP);
    this.stateTimer = 450;
    this.setVelocity(0, 0);

    // FIXED: Non-zero directional resolution when sharing same tile
    if (er === pr && ec !== pc) {
      this.attackDir = { x: Math.sign(pc - ec), y: 0 };
    } else if (ec === pc && er !== pr) {
      this.attackDir = { x: 0, y: Math.sign(pr - er) };
    } else {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.attackDir = { x: Math.sign(dx) || (this.flipX ? -1 : 1), y: 0 };
      } else {
        this.attackDir = { x: 0, y: Math.sign(dy) || 1 };
      }
    }

    if (this.attackDir.x !== 0) {
      this.setFlipX(this.attackDir.x < 0);
    }
  }

  public override destroy(fromScene?: boolean) {
    this.stopStateTweens();
    if (this.indicator) {
      this.indicator.destroy();
    }
    super.destroy(fromScene);
  }
```

#### Step E: Syncing Indicator Position & Spawning Particle Effects
In `updateAI(time, delta, player, map, bombTiles)`:
```typescript
  // Sync companion indicator position
  if (this.indicator && this.indicator.active) {
    this.indicator.setPosition(this.x, this.y - 24);
  }

  // Spawn walking dust or charge smoke particles
  this.particleTimer -= delta;
  if (this.particleTimer <= 0 && this.scene) {
    if (this.aiState === EnemyState.ATTACK) {
      this.particleTimer = 65;
      this.spawnParticle(this.x, this.y + 6, 4, 0xffaa44, 0.7);
    } else if (this.aiState === EnemyState.PATROL || this.aiState === EnemyState.TRACKING || this.aiState === EnemyState.HUNTING) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      if (body && (Math.abs(body.velocity.x) > 10 || Math.abs(body.velocity.y) > 10)) {
        this.particleTimer = 220;
        this.spawnParticle(this.x, this.y + 12, 3, 0xffffff, 0.5);
      }
    }
  }
```

---

## 5. Verification Method

### 5.1 Automated Test Execution
Run the complete test suite:
```bash
npm test
```
- Existing tests (`pathfinding.test.mjs`, `ai_pathfinding_stress.test.mjs`, `input_state.test.mjs`) must all pass with 0 failures.
- Add new test cases to `tests/ai_pathfinding_stress.test.mjs` to verify:
  1. Enemy state transitions: `IDLE -> PATROL -> HUNTING -> WINDUP -> ATTACK -> COOLDOWN -> IDLE`.
  2. Indicator string and visibility mapping across all states.
  3. `attackDir` non-zero assertion when `er === pr && ec === pc`.
  4. Cleanup on destroy.

### 5.2 Next.js Build Verification
Verify clean build and zero TypeScript errors:
```bash
npm run build
```
- Exit code must be 0.
- Verify TypeScript types, Phaser types, and Next.js Turbopack compilation.

### 5.3 In-Game Visual Inspection
- Start `npm run dev` and navigate to `http://localhost:3000`.
- Verify:
  1. Enemies breathe with squash & stretch while IDLE (showing `...`).
  2. Enemies waddle back and forth while walking (leaving faint dust puffs).
  3. Enemies pop a golden `!` when hunting the player.
  4. Enemies flash red with `⚠️` and compress before charging.
  5. Enemies stretch along charge axis with orange smoke during ATTACK.
  6. Enemies squash flat with rotating dizzy `💫` stars during COOLDOWN.
  7. When destroyed by bomb explosion, indicator and tweens are cleanly eliminated without errors in developer console.
