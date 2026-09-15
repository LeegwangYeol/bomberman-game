# Handoff Report: Bomb Creation, Fuse Ticking Tweens, Explosion Visual Impact, and Test Infrastructure

**Agent:** `explorer_bombs_refine`  
**Working Directory:** `/Users/user/src/bomberman/.agents/explorer_bombs_refine`  
**Date:** 2026-09-15T01:25:30Z  
**Recipient:** `orchestrator_refine` (`5ba8d8e8-7e3d-47e7-b8f4-049c5ea9cdec`)  
**Status:** Task Complete (Hard Handoff)

---

## Executive Summary
This investigation analyzed the bomb creation, fuse timing, tween animations, explosion presentation, and test infrastructure in `src/game/GameScene.ts` and `tests/`. Currently, bombs use a static, monotone 250ms yoyo tween with subtle 1.1x scaling, and explosions rely on a mild 100ms camera shake with a 300ms linear fade. To fulfill Requirement R3 of the Refinement Phase, we designed a **3-stage accelerating ticking tween** (escalating from a rhythmic 250ms pulse to a high-urgency 150ms orange pulse, concluding in a 65ms critical red/white hyper-strobe at 1.35x scale) and a **5-layer high-impact explosion visual system** (screen flash, tuned camera impulse, expanding vector shockwave ring, explosive bloom easing, and block shatter debris). Furthermore, because Phaser requires browser globals (`window is not defined` in Node.js), we outlined an architectural test plan mirroring the existing `EnemyStateMachineSim` pattern to establish `tests/bomb_lifecycle.test.mjs` verifying all invariants, timer phases, raycast propagation, and chain detonations.

---

## 1. Observation

### 1.1 Current Bomb Lifecycle in `src/game/GameScene.ts`
- **State & Groups**:
  - `GameScene.ts:287-288`: `private bombs!: Phaser.Physics.Arcade.Group;` and `private explosions!: Phaser.Physics.Arcade.Group;`.
  - `GameScene.ts:292-294`: `activeBombs: number = 0;`, `maxBombs: number = 1;`, `bombPower: number = 2;` (blast radius in tiles).
  - `GameScene.ts:327-328`: Instantiated in `create()` as `this.bombs = this.physics.add.group();` and `this.explosions = this.physics.add.group();`.
  - `GameScene.ts:349, 353`: Physics colliders added for player and enemies against `this.bombs`.
- **Placement & Grid Alignment (`GameScene.ts:492-531`)**:
  - Triggered in `update()` via Spacebar or `window.mobileInput.bomb` (`GameScene.ts:467-470`).
  - Snaps to discrete tile centers:
    ```typescript
    const col = Math.floor(this.player.x / TILE_SIZE);
    const row = Math.floor(this.player.y / TILE_SIZE);
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;
    ```
  - Rejection checks: returns early if `this.isGameOver` or `this.activeBombs >= this.maxBombs`, or if another active bomb already occupies `(centerX, centerY)` (`GameScene.ts:493, 502-510`).
  - Physics body: `(bomb.body as Phaser.Physics.Arcade.Body)?.setSize(36, 36).setOffset(2, 2).setImmovable(true);` (`GameScene.ts:514-515`).
- **Current Fuse & Tween Presentation (`GameScene.ts:518-530`)**:
  - Tween:
    ```typescript
    this.tweens.add({
      targets: bomb,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 250,
      yoyo: true,
      repeat: -1,
    });
    ```
  - Timer: `this.time.delayedCall(2000, () => this.explodeBomb(bomb, row, col));` (`GameScene.ts:530`).
  - Limitations observed:
    1. Static pulse speed: It maintains an unchanging 250ms yoyo rate throughout the entire 2000ms duration.
    2. Barely perceptible scale: 1.0 to 1.1 is only 3.6 pixels difference on a 36px sprite.
    3. Monochromatic: No tint shifts, warming, or flashing to indicate the fuse burning down.
- **Detonation & Blast Propagation (`GameScene.ts:533-572`)**:
  - `explodeBomb()` destroys bomb sprite and decrements `activeBombs` (`GameScene.ts:535-536`).
  - Camera shake: `this.cameras.main.shake(100, 0.004);` (`GameScene.ts:538`).
  - Spawns center explosion `this.spawnExplosion(row, col);` (`GameScene.ts:541`).
  - Raycasts in 4 cardinal directions (`{dr: -1, dc: 0}`, `{dr: 1, dc: 0}`, `{dr: 0, dc: -1}`, `{dr: 0, dc: 1}`) up to `this.bombPower = 2`:
    - Breaks on `TILE_WALL` (`GameScene.ts:557-559`).
    - Destroys block via `this.destroyBlock(nr, nc)`, spawns explosion, and breaks on `TILE_BLOCK` (`GameScene.ts:561-566`).
    - Spawns explosion and continues on `TILE_EMPTY` (`GameScene.ts:569`).
- **Explosion Sprite & Overlap Cleanup (`GameScene.ts:574-605`)**:
  - `spawnExplosion()` creates 'explosion' sprite at `(x, y)` with depth 12.
  - Dynamically attaches per-sprite physics overlaps (`GameScene.ts:582-592`) for player kill and enemy kill.
  - Tween linearly fades `alpha: 1 -> 0.4`, scales `scale: 1 -> 1.15` over 300ms, then calls `exp.destroy()`.
  - Block destruction (`GameScene.ts:607-615`): instantly destroys sprite with no visual fragments.

### 1.2 Existing Test Infrastructure
- **Test Runner (`package.json:10`)**:
  - `"test": "node --experimental-strip-types --test tests/*.test.mjs"`.
  - Uses native Node.js test runner (`node:test` and `node:assert/strict`).
  - All 25 current tests pass in ~88ms.
- **Current Coverage**:
  - `tests/pathfinding.test.mjs`: BFS grid navigation, obstacles, bomb avoidance, fallback.
  - `tests/input_state.test.mjs`: Joystick angles, direction decoding, input reset.
  - `tests/ai_pathfinding_stress.test.mjs`: BFS invariants, enclosed corners, bomb barricades, 500 dynamic mutations, 5,000 query benchmark, and `EnemyStateMachineSim` (6 suites).
- **Critical Node.js Constraint Identified**:
  - Bare Node.js execution `node -e "import('phaser')"` yields:  
    `ReferenceError: window is not defined`
  - `Phaser` cannot be imported directly into `tests/*.test.mjs` without a browser runtime or headless mock environment.
  - The project precedent in `ai_pathfinding_stress.test.mjs` successfully bypassed this by creating high-fidelity algorithmic simulators (`EnemyStateMachineSim`) that test exact gameplay logic without browser dependencies.

---

## 2. Logic Chain

```
[Observation: Bomb uses flat 250ms repeat:-1 tween with 1.1x scale over 2000ms]
       │
       ▼
[Deduction: Players cannot perceive fuse countdown or imminent detonation danger]
       │
       ▼
[Design: 3-Stage Accelerating Ticking Progression]
 ├─ Stage 1 (0-1000ms): Steady ticking heart (250ms pulse, scale 1.15, normal tint)
 ├─ Stage 2 (1000-1600ms): Urgent alert (150ms pulse, scale 1.25, amber tint 0xff8866)
 └─ Stage 3 (1600-2000ms): Critical detonation swell (65ms hyper-pulse, scale 1.35, flashing red 0xff2222)
       │
       ▼
[Phaser Capability Check: Phaser 4.2.1 supports scene.tweens.chain({ targets, tweens })]
       │
       ▼
[Observation: Current explosion is 100ms shake + 300ms linear fade of explosion sprite]
       │
       ▼
[Design: 5-Layer Impact System]
 ├─ Layer 1: Screen Flash (cameras.main.flash(80, 255, 230, 160))
 ├─ Layer 2: Tuned Camera Shake (cameras.main.shake(150, 0.008))
 ├─ Layer 3: Expanding Vector Shockwave Ring (tweens.addCounter on Phaser.Graphics)
 ├─ Layer 4: Explosive Bloom & Tint Variation (pop scale 0.7 -> 1.3 with Back.easeOut; core vs arm tints)
 └─ Layer 5: Shatter Debris on Block Destruction (quadrant fragments flying outward)
       │
       ▼
[Observation: Bare Node.js cannot import Phaser due to window is not defined]
       │
       ▼
[Test Architecture: Author tests/bomb_lifecycle.test.mjs using BombLifecycleSimulator]
 └─ Tests placement alignment, active bomb counting, fuse progression, 4-way raycast propagation, and chain detonation
```

---

## 3. Caveats & Risks

1. **Tween & Timer Leaks on Early Detonation (Chain Reactions / Player Death)**:
   - *Risk*: If a bomb is destroyed before its 2000ms timer expires (e.g. caught in another bomb's explosion or scene restarts), orphaned delayed calls or tweens could attempt to execute on destroyed sprites or cause `activeBombs` counter desynchronization.
   - *Mitigation*:
     - Store timer and tween references in sprite data: `bomb.setData('fuseTimer', timer); bomb.setData('tweenChain', chain);`.
     - In `explodeBomb()`, retrieve and cleanly cancel: `timer?.remove(false); chain?.stop();`.
     - Guard with `if (!bomb.active) return;` and clamp `this.activeBombs = Math.max(0, this.activeBombs - 1);`.
2. **Redundant Physics Overlap Handlers**:
   - *Risk*: Currently `spawnExplosion()` calls `this.physics.add.overlap(this.player, exp)` and `this.physics.add.overlap(this.enemies, exp)` dynamically for every explosion tile spawned (up to 9 times per bomb). Over dozens of bomb blasts, this populates Phaser's physics collision array with stale/redundant checks.
   - *Mitigation*: Define the overlap once in `create()` targeting the groups: `this.physics.add.overlap(this.player, this.explosions, ...)` and `this.physics.add.overlap(this.enemies, this.explosions, ...)`.
3. **Camera Shake Saturation**:
   - *Risk*: If multiple bombs explode simultaneously or in rapid chain reactions, stacking camera shake calls can induce disorienting screen jitter.
   - *Mitigation*: Limit maximum shake intensity to `0.008` and duration to `150ms`.
4. **Vector Graphics Cleanup**:
   - *Risk*: Spawning `this.add.graphics()` for expanding shockwave rings could leak memory if not explicitly destroyed.
   - *Mitigation*: Attach `onComplete: () => shockwave.destroy()` to the counter tween.

---

## 4. Conclusion & Concrete Recommendations

### 4.1 Implementation Plan for Worker Agents

#### A. Multi-Stage Accelerating Bomb Ticking (`GameScene.ts:placeBomb`)
Replace lines 518-531 with the following structured tween chain:

```typescript
// Multi-stage accelerating pulse tween chain (Total duration = 2000ms)
const tweenChain = this.tweens.chain({
  targets: bomb,
  tweens: [
    // Phase 1: Normal Rhythmic Pulse (0ms - 1000ms: 2 cycles @ 250ms half-period)
    {
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 250,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
    },
    // Phase 2: Accelerated Warning Pulse (1000ms - 1600ms: 2 cycles @ 150ms half-period)
    {
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 150,
      yoyo: true,
      repeat: 1,
      ease: 'Quad.easeInOut',
      onStart: () => {
        if (bomb.active) bomb.setTint(0xff8866); // Warning amber tint
      },
    },
    // Phase 3: Critical Detonation Swell & Hyper-Pulse (1600ms - 2000ms: ~3 cycles @ 65ms half-period)
    {
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 65,
      yoyo: true,
      repeat: 2,
      ease: 'Back.easeOut',
      onStart: () => {
        if (bomb.active) bomb.setTint(0xff2222); // Critical red alert
      },
    },
  ],
});

this.activeBombs++;

// Attach references to bomb data for clean lifecycle management
const fuseTimer = this.time.delayedCall(2000, () => this.explodeBomb(bomb, row, col));
bomb.setData('fuseTimer', fuseTimer);
bomb.setData('tweenChain', tweenChain);
```

#### B. High-Impact Detonation & Shockwave Ring (`GameScene.ts:explodeBomb`)
Upgrade lines 533-572:

```typescript
explodeBomb(bomb: Phaser.Physics.Arcade.Sprite, row: number, col: number) {
  if (!bomb.active) return;

  // Clean up timers & tweens
  const timer = bomb.getData('fuseTimer') as Phaser.Time.TimerEvent | undefined;
  if (timer) timer.remove(false);
  const chain = bomb.getData('tweenChain') as Phaser.Tweens.TweenChain | undefined;
  if (chain) chain.stop();

  bomb.destroy();
  this.activeBombs = Math.max(0, this.activeBombs - 1);

  // 1. Tactile Camera Shake
  this.cameras.main.shake(150, 0.008);

  // 2. High-Impact Screen Flash (subtle warm golden-white flash)
  this.cameras.main.flash(80, 255, 230, 160, false);

  // 3. Dynamic Expanding Shockwave Ring
  const centerX = col * TILE_SIZE + TILE_SIZE / 2;
  const centerY = row * TILE_SIZE + TILE_SIZE / 2;
  const shockwave = this.add.graphics();
  shockwave.setDepth(15);
  this.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 220,
    ease: 'Quad.easeOut',
    onUpdate: (tween) => {
      const t = tween.getValue();
      shockwave.clear();
      shockwave.lineStyle(3 * (1 - t) + 0.5, 0xffe066, 0.85 * (1 - t));
      shockwave.strokeCircle(centerX, centerY, 8 + t * (TILE_SIZE * 1.3));
    },
    onComplete: () => {
      shockwave.destroy();
    },
  });

  // Spawn Epicenter Explosion (isCenter = true)
  this.spawnExplosion(row, col, true);

  // Cardinal direction raycasts
  const directions = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  for (const dir of directions) {
    for (let i = 1; i <= this.bombPower; i++) {
      const nr = row + dir.dr * i;
      const nc = col + dir.dc * i;

      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
      if (this.map[nr][nc] === TILE_WALL) break;

      if (this.map[nr][nc] === TILE_BLOCK) {
        this.destroyBlock(nr, nc);
        this.spawnExplosion(nr, nc, false);
        break;
      }

      this.spawnExplosion(nr, nc, false);

      // Check for chain reaction with other bombs
      this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
        const otherBomb = child as Phaser.Physics.Arcade.Sprite;
        if (otherBomb.active) {
          const bCol = Math.floor(otherBomb.x / TILE_SIZE);
          const bRow = Math.floor(otherBomb.y / TILE_SIZE);
          if (bRow === nr && bCol === nc) {
            this.explodeBomb(otherBomb, bRow, bCol);
          }
        }
      });
    }
  }
}
```

#### C. Punchy Explosion Bloom & Block Debris (`GameScene.ts:spawnExplosion` & `destroyBlock`)
```typescript
spawnExplosion(row: number, col: number, isCenter: boolean = false) {
  const x = col * TILE_SIZE + TILE_SIZE / 2;
  const y = row * TILE_SIZE + TILE_SIZE / 2;

  const exp = this.explosions.create(x, y, 'explosion') as Phaser.Physics.Arcade.Sprite;
  exp.setDepth(12);

  // Center core has bright brilliant tint, arms have hot orange tint
  if (isCenter) {
    exp.setTint(0xffffcc);
  } else {
    exp.setTint(0xff7722);
  }

  // Explosive bloom easing: pop in with Back.easeOut, then rapid fade
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
}

destroyBlock(row: number, col: number) {
  this.map[row][col] = TILE_EMPTY;
  const centerX = col * TILE_SIZE + TILE_SIZE / 2;
  const centerY = row * TILE_SIZE + TILE_SIZE / 2;

  this.blocks.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
    const b = child as Phaser.Physics.Arcade.Sprite;
    if (b && b.active && b.getData('row') === row && b.getData('col') === col) {
      // Spawn 4 crumbling debris fragments
      const offsets = [
        { dx: -6, dy: -6, vx: -25, vy: -25 },
        { dx: 6, dy: -6, vx: 25, vy: -25 },
        { dx: -6, dy: 6, vx: -25, vy: 25 },
        { dx: 6, dy: 6, vx: 25, vy: 25 },
      ];
      offsets.forEach((off) => {
        const frag = this.add.rectangle(centerX + off.dx, centerY + off.dy, 8, 8, 0xb87333);
        frag.setDepth(11);
        this.tweens.add({
          targets: frag,
          x: frag.x + off.vx,
          y: frag.y + off.vy,
          alpha: 0,
          angle: 45,
          duration: 220,
          onComplete: () => frag.destroy(),
        });
      });

      b.destroy();
    }
  });
}
```

#### D. Centralize Physics Overlaps in `GameScene.ts:create()`
In `create()`:
```typescript
// Global explosion overlaps (replaces per-sprite overlap additions in spawnExplosion)
this.physics.add.overlap(this.player, this.explosions, () => {
  this.playerDie();
});
this.physics.add.overlap(this.enemies, this.explosions, (_player, enemyHit) => {
  const target = enemyHit as Phaser.GameObjects.GameObject;
  if (target.active) {
    target.destroy();
  }
});
```

---

### 4.2 Test Plan for Challenger Agents

Challengers should create a dedicated test suite `tests/bomb_lifecycle.test.mjs` incorporating a `BombLifecycleSimulator` class.

#### Key Test Scenarios:
1. **Snapping & Tile Coordinates**: Verify player pixel positions across various tiles correctly calculate discrete tile centers `(col * 40 + 20, row * 40 + 20)`.
2. **Bomb Placement Boundaries & Duplicate Prevention**:
   - Verify placing bomb on empty tile increments `activeBombs`.
   - Verify attempting to place second bomb on the same tile is blocked.
   - Verify exceeding `maxBombs` is blocked.
3. **Multi-Stage Fuse Progression Invariants**:
   - `t < 1000ms`: Stage 1 (Scale 1.15, period 500ms, tint 0xffffff).
   - `1000ms <= t < 1600ms`: Stage 2 (Scale 1.25, period 300ms, tint 0xff8866).
   - `1600ms <= t <= 2000ms`: Stage 3 (Scale 1.35, period 130ms, tint 0xff2222).
   - State transition boundaries are exact.
4. **4-Way Blast Propagation Invariants**:
   - Center tile always detonates.
   - Blast stops at `TILE_WALL` (wall never destroyed, ray halts).
   - Blast destroys `TILE_BLOCK` (block tile added to explosion list, map updated to `TILE_EMPTY`, ray terminates without penetrating).
   - Blast travels full `bombPower` tiles through `TILE_EMPTY`.
   - Out of bounds indices are guarded.
5. **Chain Detonation**:
   - Bomb A blast overlapping Bomb B triggers immediate detonation of Bomb B.
   - `activeBombs` counter correctly reaches 0 after all chain explosions conclude.
6. **Damage Area of Effect (AoE)**:
   - Player or enemy standing on any blast tile registers hit.
   - Entity 1 pixel outside blast radius is unaffected.

---

## 5. Verification Method

### 5.1 Automated Test Execution
Run the following commands in the project root:
```bash
npm test
```
*Expected Result*: All existing tests (25 passing) plus new `tests/bomb_lifecycle.test.mjs` pass with 0 failures.

```bash
npm run lint
```
*Expected Result*: ESLint exits 0 with 0 errors.

```bash
npm run build
```
*Expected Result*: Turbopack compiles and generates production static pages with 0 errors (`exit code 0`).

### 5.2 Manual Browser Verification Criteria
When running `npm run dev`:
1. **Bomb Placement**: Pressing Spacebar drops a bomb directly centered on the player's current corridor grid tile.
2. **Ticking Escalation**:
   - During the first second, the bomb rhythmically throbs (gentle pulse).
   - At 1 second, the bomb noticeably accelerates its pulsation and turns warm amber.
   - In the final 0.4 seconds, the bomb rapidly vibrates/strobes in bright red at an enlarged 1.35x scale.
3. **Explosion Impact**:
   - At 2.0s, the bomb bursts with a golden screen flash and a punchy camera shake.
   - A crisp yellow shockwave ring expands outward from the epicenter.
   - Explosion fire tiles bloom outward with bright white-hot center and fiery arms.
   - Any breakable blocks hit by the blast shatter with visible flying debris before disappearing.
4. **Clean Detonation**:
   - No graphical artifacts, frozen timers, or orphaned sprites remain after detonation.

### 5.3 Invalidation Conditions
- If Phaser's `scene.tweens.chain` fails or drops frames on mobile devices, fallback to sequential delayed-call tweens.
- If camera shake causes UI jitter outside the canvas, verify canvas boundary encapsulation.
