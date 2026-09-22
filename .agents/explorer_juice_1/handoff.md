# Comprehensive Game Feel ("Juice") & Animation Architecture Report

**Agent:** Explorer 3 (`explorer_juice_1`)  
**Mission:** Game Feel ("Juice"), Squash-and-Stretch, Bomb Pulsing, Explosion Trauma & Hit-Stop, Zero-GC Particle Emitters, and Dynamic Drop Shadows  
**Working Directory:** `/Users/user/src/bomberman/.agents/explorer_juice_1`  
**Date:** 2026-09-22  

---

## 1. Observation

### Obs 1.1: Character & Enemy Physics vs Scale Coupling in Phaser Arcade Physics
- **File Path:** `/Users/user/src/bomberman/node_modules/phaser/src/physics/arcade/Body.js`
  - Lines 1015–1026:
    ```javascript
    var asx = Math.abs(transform.scaleX);
    var asy = Math.abs(transform.scaleY);

    if (this._sx !== asx || this._sy !== asy)
    {
        this.width = this.sourceWidth * asx;
        this.height = this.sourceHeight * asy;
        this._sx = asx;
        this._sy = asy;
        recalc = true;
    }
    ```
  - Lines 1065–1066:
    ```javascript
    this.position.x = transform.x + transform.scaleX * (this.offset.x - transform.displayOriginX);
    this.position.y = transform.y + transform.scaleY * (this.offset.y - transform.displayOriginY);
    ```
- **File Path:** `/Users/user/src/bomberman/src/game/GameScene.ts`
  - Lines 1242:
    ```typescript
    (this.player.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(8, 8);
    ```
  - Lines 2364–2376 (`updatePlayerMovement`):
    ```typescript
    const tol = this.cornerSlideTolerance || 8;
    const px = this.player.x;
    const py = this.player.y;
    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);
    const colCenterX = col * TILE_SIZE + TILE_SIZE / 2;
    const rowCenterY = row * TILE_SIZE + TILE_SIZE / 2;
    const diffX = px - colCenterX;
    const diffY = py - rowCenterY;
    ```
  - Lines 2448–2452:
    ```typescript
    if (Math.abs(diffY) > snapThreshold) {
      vy = -Math.sign(diffY) * slideSpeed;
    } else {
      this.player.y = rowCenterY;
      vy = 0;
    }
    ```
  - Lines 2456–2457:
    ```typescript
    const canRoundUp = diffY <= 0 && Math.abs(diffY) <= tol && isPassable(row - 1, col) && isPassable(row - 1, nextCol);
    const canRoundDown = diffY >= 0 && Math.abs(diffY) <= tol && isPassable(row + 1, col) && isPassable(row + 1, nextCol);
    ```
- **File Path:** `/Users/user/src/bomberman/src/game/entities/BaseEntity.ts`
  - Line 52:
    ```typescript
    (this.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(8, 8);
    ```
- **File Path:** `/Users/user/src/bomberman/src/game/entities/EnemyEntities.ts`
  - Line 173 (`ChaserEnemy`):
    ```typescript
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
      this.escapePath.shift();
    ```

### Obs 1.2: Current Bomb Pulsing Tween Chain
- **File Path:** `/Users/user/src/bomberman/src/game/GameScene.ts`
  - Lines 2541–2579 (`placeBomb`):
    ```typescript
    const tweenChain = this.tweens.chain({
      targets: bomb,
      tweens: [
        // Phase 1: Normal Rhythmic Pulse (0ms - 1000ms: 2 cycles @ 250ms half-period)
        { scaleX: 1.15, scaleY: 1.15, duration: 250, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' },
        // Phase 2: Accelerated Warning Pulse (1000ms - 1600ms: 2 cycles @ 150ms half-period)
        { scaleX: 1.25, scaleY: 1.25, duration: 150, yoyo: true, repeat: 1, ease: 'Quad.easeInOut',
          onStart: () => { if (bomb.active) bomb.setTint(0xff8866); } },
        // Phase 3: Critical Detonation Swell & Hyper-Pulse (1600ms - 2000ms: ~3 cycles @ 65ms half-period)
        { scaleX: 1.35, scaleY: 1.35, duration: 65, yoyo: true, repeat: 2, ease: 'Back.easeOut',
          onStart: () => { if (bomb.active) bomb.setTint(0xff2222); } }
      ]
    });
    ```
  - Lines 2587–2593:
    ```typescript
    const fuseTimer = this.time.delayedCall(2000, () => {
      if (bomb && bomb.active) {
        const curCol = Math.floor(bomb.x / TILE_SIZE);
        const curRow = Math.floor(bomb.y / TILE_SIZE);
        this.explodeBomb(bomb, curRow, curCol);
      }
    });
    ```
  - Bomb visual scaling currently scales symmetrically (`scaleX = scaleY`).
  - No fuse spark particles exist at fuse tip `(x + 9, y - 15)`.
  - No pre-detonation anticipation contraction (squash before burst).

### Obs 1.3: Explosion Camera Shake vs CameraTraumaSimulator Integration
- **File Path:** `/Users/user/src/bomberman/src/game/GameScene.ts`
  - Line 2785 (`explodeBomb`):
    ```typescript
    // 1. Tactile Camera Shake
    this.cameras.main.shake(150, 0.008);
    ```
  - Lines 1757–1762 (`GameScene.update`):
    ```typescript
    // 0c. Update camera trauma shake model
    this.cameraTrauma.update(delta / 1000);
    const shake = this.cameraTrauma.getOffsets(_time);
    this.cameras.main.setScroll(shake.x, shake.y);
    this.cameras.main.setRotation(shake.angle * (Math.PI / 180));
    ```
  - Lines 3281–3291 (`executeSuperNova`):
    ```typescript
    // 1. Implosion & Hit-stop
    this.physics.world.pause();
    this.player.setTint(0xffffff);
    this.player.setScale(0.75);
    webAudioSynth.playSuperNovaShockwave();

    this.time.delayedCall(skill.hitStopMs ?? 60, () => {
      this.physics.world.resume();
      this.player.clearTint();
      this.player.setScale(1.0);
    });
    ```
- **File Path:** `/Users/user/src/bomberman/src/game/ultimate_skills.ts`
  - Lines 163–217 (`CameraTraumaSimulator`):
    Non-linear square-law trauma decay:
    $$\text{offsetPx} = \text{trauma}^2 \times \text{maxOffset} \quad (\text{maxOffset} = 18\text{px})$$
    $$\text{angleDeg} = \text{trauma}^2 \times \text{maxAngle} \quad (\text{maxAngle} = 3.5^\circ)$$
    $$\text{Decay Rate} = 1.4\text{ s}^{-1}$$
    Uses persistent `_scratchOffsets` and `_scratchMagnitude` with 0 byte GC allocation.

### Obs 1.4: Current Ad-Hoc Particle Allocations vs Zero-GC Requirements
- **File Path:** `/Users/user/src/bomberman/src/game/GameScene.ts`
  - Lines 2950–2962 (`destroyBlock`):
    ```typescript
    offsets.forEach((off) => {
      const frag = this.add.rectangle(centerX + off.dx, centerY + off.dy, 8, 8, isChest ? 0xfbbf24 : 0xb87333);
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
    ```
  - Lines 2992–3005 (`playerDie` shield shatter):
    Spawns 8 individual `this.add.circle(...)` game objects and destroys each in a tween callback.
- **File Path:** `/Users/user/src/bomberman/src/game/entities/BaseEntity.ts`
  - Lines 126–139 (`die`):
    Spawns 6 individual `this.scene.add.circle(...)` game objects and destroys each in a tween callback.
- **File Path:** `/Users/user/src/bomberman/src/game/pooling/ObjectPool.ts`
  - Lines 1–70: Contiguous, pre-allocated Zero-GC pool engine exists in the repo, tested with 10k frame soak tests.
- **File Path:** `/Users/user/src/bomberman/node_modules/phaser/src/gameobjects/particles/ParticleEmitter.js`
  - Lines 40–120: Modern Phaser 3.60+ / 4.x `this.add.particles()` uses an internal contiguous array of pre-allocated particles, supporting `emitter.explode(count, x, y)` and `emitter.emitParticleAt(x, y)` with zero garbage collection allocations.

### Obs 1.5: Current Drop Shadows in Assets
- **File Path:** `/Users/user/src/bomberman/scripts/generate-assets.sh`
  - Line 34 (`player.svg`): `<ellipse cx="20" cy="37" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>`
  - Line 240 (`enemy.svg`): `<ellipse cx="20" cy="37" rx="13" ry="3" fill="rgba(0,0,0,0.25)"/>`
  - Line 271 (`enemy_tracker.svg`): `<ellipse cx="20" cy="37" rx="12" ry="2.8" fill="rgba(0,0,0,0.3)"/>`
  - Line 308 (`bomb.svg`): `<ellipse cx="20" cy="37" rx="13" ry="3" fill="rgba(0,0,0,0.35)"/>`
  - Shadows are baked into the bottom 3 pixels of the 40x40 texture files.
  - Blocks and walls have 0 drop shadow onto the floor corridor.
  - Items have 0 shadow.

---

## 2. Logic Chain

### 2.1 Character & Enemy Squash-and-Stretch without Physics Desync
1. From **Obs 1.1**, Phaser Arcade Physics automatically couples GameObject transforms with `body` dimensions:
   - `this.width = this.sourceWidth * Math.abs(transform.scaleX)`
   - `this.height = this.sourceHeight * Math.abs(transform.scaleY)`
   - `this.position.y = transform.y + transform.scaleY * (this.offset.y - transform.displayOriginY)`
2. In `GameScene.ts`, the player corridor width is 40px, and the physics body is $24 \times 24\text{px}$ with an 8px offset.
3. If a developer applies a squash tween directly to the physics sprite (`this.player.setScale(1.15, 0.85)`):
   - `body.width` expands from 24px to $27.6\text{px}$ (reducing corridor clearance from 8px to 6.2px).
   - `body.position.y` shifts, altering collision bounds.
4. Even more critically: if vertical bobbing is implemented by tweening `this.player.y`:
   - `diffY = py - rowCenterY` is altered by $\pm 3\text{px}$.
   - At corners where $\text{diffY} \approx 7\text{px}$, adding $2\text{px}$ exceeds `tol = 8`, causing the corner-rounding check (`Math.abs(diffY) <= tol`) to evaluate to `false`.
   - The player will physically snag, stutter, and freeze on corridor corners during movement.
5. In addition, `OverheadUI` updates its position using `this.x, this.y` (**Obs 1.1**). If `this.y` bobs, floating HP bars and name tags will vibrate vertically, looking erratic.
6. **Solution Architecture:**
   - **Body Invariant Guard**: Freeze the Arcade physics body against scale changes by overriding `body.updateBounds` and `body.updateFromGameObject` on the entity sprite:
     ```typescript
     body.updateBounds = function() {
       this.width = this.sourceWidth;   // Fixed 24
       this.height = this.sourceHeight; // Fixed 24
       this.halfWidth = 12;
       this.halfHeight = 12;
       this.updateCenter();
     };
     body.updateFromGameObject = function() {
       this.updateBounds();
       this.position.x = this.transform.x - 12;
       this.position.y = this.transform.y - 12;
       this.updateCenter();
     };
     ```
   - **Decoupled Visual Bobbing via `displayOriginY`**:
     Instead of moving `sprite.y`, modulate `sprite.displayOriginY`:
     - Default anchor is center: `displayOriginY = 20`.
     - When walking: $\text{bobOffset} = |\sin(\text{stepCycle} \times \pi)| \times 3\text{px}$.
     - Setting `displayOriginY = 20 - bobOffset` shifts the visual raster rendering upward by 0 to 3 pixels.
     - `sprite.y` and `body.position.y` remain exactly at tile center `rowCenterY`!
     - Result: 100% fluid visual bobbing, 0% physics jitter, 0% corner snagging, and `OverheadUI` stays rock-solid.
   - **Squash-and-Stretch Modulation**:
     - At footstep impact ($\text{bobOffset} \to 0$): Squash to $\text{scaleX} = 1.08, \text{scaleY} = 0.92$.
     - At step apex ($\text{bobOffset} \to 3$): Stretch to $\text{scaleX} = 0.94, \text{scaleY} = 1.06$.
     - When stationary (Idle): Gentle breathing cycle ($1200\text{ms}$ duration, $\text{scaleY}: 1.02, \text{scaleX}: 0.98$, `ease: 'Sine.easeInOut'`).
     - Lean/Tilt: When moving left/right, apply $\text{angle} = \text{sign}(v_x) \times 3.5^\circ$.
   - **Archetype Variations for Enemies**:
     - `ChaserEnemy`: High-frequency, sharp $4^\circ$ forward lean with rapid $120\text{ms}$ waddle.
     - `TankEnemy`: Heavy stomp with $80\text{ms}$ deep squash ($\text{scaleX}: 1.15, \text{scaleY}: 0.85$) on each grid step.
     - `GhostEnemy`: Sine wave floating hover ($\text{bobOffset} = \sin(\text{time} \times 0.003) \times 4\text{px}$), no ground squash, semi-translucent pulsing alpha ($0.7 \leftrightarrow 0.95$).

---

### 2.2 Punchy Bomb Pulsing Animations
1. From **Obs 1.2**, bombs currently pulse symmetrically via `scaleX: 1.15..1.35, scaleY: 1.15..1.35`.
2. Uniform geometric scaling feels robotic and lacks the organic pressure swell of classic arcade bombs.
3. In classical cartoon animation (Anticipation and Exaggeration):
   - **Phase 1 (Rhythmic Heartbeat, 0–1000ms)**:
     - Asymmetric pulse: swells horizontally first ($\text{scaleX}: 1.14, \text{scaleY}: 1.04$), then rebounds vertically ($\text{scaleX}: 0.96, \text{scaleY}: 1.18$).
   - **Phase 2 (Boiling Pressure, 1000–1600ms)**:
     - Frequency doubles ($120\text{ms}$ cycle).
     - Color tint transitions to hot amber (`0xff8844`).
     - Squash intensifies ($\text{scaleX}: 1.22, \text{scaleY}: 0.90 \leftrightarrow \text{scaleX}: 0.92, \text{scaleY}: 1.28$).
   - **Phase 3 (Critical Alert, 1600–1900ms)**:
     - Rapid hyper-pulse ($60\text{ms}$ cycle).
     - Flashing crimson tint (`0xff2222`).
     - Micro-jitter on rotation: `angle: ±3.5°` at $40\text{ms}$ intervals to communicate bursting internal pressure.
   - **Phase 4 (Detonation Anticipation "Gasp", 1900–2000ms)**:
     - Exactly $100\text{ms}$ before detonation, the bomb suddenly *contracts* sharply to $\text{scaleX}: 0.80, \text{scaleY}: 0.80$ while flashing pure white (`setTint(0xffffff)`).
     - This rapid contraction ("inhale before blast") creates an immense psychological anticipation that makes the subsequent explosion feel 10x larger and punchier.
4. **Fuse Spark Integration**:
   - The SVG texture has a static yellow star at `(x + 9, y - 15)`.
   - Attaching a dedicated spark particle emitter at the fuse coordinate that emits tiny flying sparks ($120\text{ms}$ lifespan, yellow/orange additive glow) reinforces live tension.

---

### 2.3 Screen Shake Trauma System & Hit-Stop Frame Freeze
1. From **Obs 1.3**, `GameScene.ts` contains two conflicting screen shake systems:
   - `this.cameraTrauma` (an advanced $T^2$ trauma simulator running in `update()` that calculates pseudo-harmonic scroll and rotation offsets).
   - `this.cameras.main.shake(150, 0.008)` (Phaser's built-in shake, called in `explodeBomb` line 2785).
2. Phaser's built-in `shake()` randomly offsets the camera viewport independently of `cameras.main.setScroll()`, causing phase cancellation, jitter, and erratic camera teleportation when both run simultaneously.
3. Furthermore, when multiple bombs explode simultaneously (chain reactions), calling `cameras.main.shake()` repeatedly restarts the timer from zero without accumulating magnitude.
4. In contrast, `cameraTrauma.addTrauma(amount)`:
   - Stacks non-linearly: $\text{Trauma} \in [0.0, 1.0]$.
   - Single bomb: `addTrauma(0.25)` $\to \text{Shake} = 0.25^2 \times 18\text{px} = 1.1\text{px}$ offset.
   - Chain reaction (3 bombs): `addTrauma(0.75)` $\to \text{Shake} = 0.75^2 \times 18\text{px} = 10.1\text{px}$ offset and $2.0^\circ$ rotation.
   - Massive explosion / Boss hit: `addTrauma(1.00)` $\to \text{Shake} = 18\text{px}$ offset and $3.5^\circ$ rotation.
5. **Hit-Stop (Frame Freeze) Mechanism**:
   - From **Obs 1.3** (`executeSuperNova`), pausing the physics world momentarily delivers visceral impact.
   - For regular explosions, an unconstrained freeze on every tile would cause stutter during multi-block destruction.
   - **Calibrated Hit-Stop Rules**:
     - Standard bomb explosion: Light hit-stop ($30\text{ms}$ / ~2 frames).
     - Destruction of 3+ blocks or enemy defeat: Medium hit-stop ($50\text{ms}$).
     - Player damage / Shield shatter: Heavy hit-stop ($70\text{ms}$).
     - **Debounce guard**: A global `lastHitStopMs` timestamp ensures hit-stop cannot trigger more frequently than once every $150\text{ms}$, preventing frame-freeze cascading during chain reactions.
     - Implementation:
       ```typescript
       public triggerHitStop(durationMs: number = 40) {
         if (this.isHitStopActive || this.time.now - this.lastHitStopMs < 150) return;
         this.isHitStopActive = true;
         this.lastHitStopMs = this.time.now;
         this.physics.world.pause();
         this.time.delayedCall(durationMs, () => {
           this.physics.world.resume();
           this.isHitStopActive = false;
         });
       }
       ```

---

### 2.4 Zero-GC Particle Emitters
1. From **Obs 1.4**, block destruction (`destroyBlock`) currently creates 4 `Rectangle` game objects and 4 individual Tweens every time a block breaks, calling `frag.destroy()` on complete.
2. When multiple bombs destroy 15 blocks simultaneously, 60 DisplayObjects and 60 Tweens are allocated and destroyed in under 300ms, triggering V8 GC pauses and violating the project's strict Zero-GC mandate.
3. From **Obs 1.4**, modern Phaser 3.60+ / 4.x features unified `ParticleEmitter` objects that maintain an internal pre-allocated typed particle pool.
4. **Three Core Emitters to Pre-allocate in `create()`**:
   - **`dustEmitter` (Walking & Landing Dust)**:
     - Emits 1–2 tiny soft puffs behind characters when moving.
     - Lifespan: $220\text{ms}$, speed: $15\text{--}30\text{px/s}$, scale: $0.6 \to 0.1$, alpha: $0.4 \to 0$.
     - Tint: Warm khaki dust (`0xd6cbb8`).
   - **`bombSparkEmitter` (Fuse Sparks)**:
     - Emits bright orange/yellow sparks from active bomb fuse tips.
     - Lifespan: $100\text{--}180\text{ms}$, gravity: $150\text{px/s}^2$, blendMode: `ADD`.
   - **`blockDebrisEmitter` (Block Destruction)**:
     - Replaces `destroyBlock` ad-hoc rectangles.
     - Pre-allocated capacity: 64 particles.
     - Lifespan: $350\text{--}480\text{ms}$, radial burst speed: $90\text{--}180\text{px/s}$, gravity: $350\text{px/s}^2$.
     - Multi-tint brick shards (`0xf97316`, `0xc2410c`, `0x78350f`) or gilded chest shards (`0xfbbf24`).
     - Triggered with single call: `this.blockDebrisEmitter.explode(8, centerX, centerY);`.

---

### 2.5 Dynamic Drop Shadows
1. From **Obs 1.5**, drop shadows are currently hard-coded inside the SVG assets (`generate-assets.sh`).
2. When an entity squashes, stretches, or bobs vertically, the baked shadow moves with the sprite instead of remaining anchored to the floor plane.
3. Furthermore, floating items and destructible blocks lack shadows, making the playfield look flat.
4. **Decoupled Ground Shadow Architecture**:
   - Generate a single reusable procedural radial gradient texture `'shadow_ellipse'` ($32 \times 16\text{px}$):
     - Center: `rgba(0, 0, 0, 0.45)` fading to transparent at outer perimeter.
   - **Layering Depth Structure**:
     - Depth 0: Floor tiles (`'floor'`)
     - Depth 1: Block/Wall static ambient occlusion shadows
     - Depth 3: Item floating drop shadows
     - Depth 4: Items
     - Depth 5: Bombs
     - Depth 6: Entity dynamic drop shadows
     - Depth 7: Soft blocks
     - Depth 9–10: Entities (Player, Enemies, Allies)
     - Depth 12–15: Explosions & Particles
     - Depth 16–20: Overhead UI
   - **Dynamic Behavior**:
     - As the player/enemy bobs upward by `h` pixels:
       - Shadow stays pinned at $(x, y + 14)$.
       - Shadow scale contracts: $\text{scale} = 1.0 - (h / 20) \times 0.25$.
       - Shadow alpha diffuses: $\text{alpha} = 0.45 - (h / 20) \times 0.20$.
     - For items:
       - Item sprite hovers with $\sin(\text{time} \times 0.004) \times 3\text{px}$.
       - Item shadow remains on ground at $(x, y + 14)$ with inverse pulsing scale.
     - For blocks & walls:
       - Draw a 4px soft dark drop shadow along the southern boundary of every wall and block during `generateMap()`. This gives immediate 2.5D arcade depth without runtime CPU overhead.

---

## 3. Caveats

1. **Phaser Version Compatibility**:
   - `package.json` specifies `"phaser": "^4.2.1"`. In Phaser 3.60+ / 4.x, particle emitters are created via `this.add.particles(x, y, texture, config)` (the older `ParticleEmitterManager` API was unified into `ParticleEmitter`). Code recommendations strictly use the modern unified API.
2. **Node.js Headless Testing vs Canvas Context**:
   - The test suite (`npm test`) runs in Node.js where Canvas and WebGL contexts do not exist natively. All graphics and texture generation in `GameScene.ts` must continue to guard canvas calls (`if (typeof document !== 'undefined')` or inside `create()`).
3. **Zero-GC Soak Test Guard**:
   - `tests/soak_10k_frames.test.mjs` enforces a strict $\le 0.25\text{MB}$ net heap drift threshold. Particle emitters and drop shadows must never allocate new objects per frame in `update()`. All shadow coordinates must be set directly on pre-allocated sprites or transform properties.

---

## 4. Conclusion

The current Bomberman implementation has strong foundations (smooth corner sliding, 537 passing tests, advanced AI, and rich progression), but lacks tactile "juice": movement is visually rigid, bomb pulsing is uniform, explosions use an uncalibrated default shake that conflicts with the trauma engine, particle effects allocate ad-hoc objects, and drop shadows are statically baked into sprite art.

By implementing the 5 key architectural upgrades detailed below, the game will achieve top-tier arcade polish while preserving 100% collision precision and Zero-GC performance:

### Summary Matrix of Recommended Upgrades

| Subsystem | Current State | Proposed Juice Architecture | Phaser 3 Implementation Mechanism |
|---|---|---|---|
| **1. Movement Squash & Bobbing** | Static sliding; 0 visual bobbing | Procedural Sine bobbing ($3\text{px}$) + step squash/stretch ($1.08 \leftrightarrow 0.94$) + $3.5^\circ$ motion tilt | Modulate `displayOriginY = 20 - bobOffset`; override `body.updateBounds` to keep physics box fixed at 24x24 |
| **2. Bomb Pulsing** | Uniform geometric scaling ($1.15 \to 1.35$) | 4-phase asymmetric heartbeat $\to$ pressure swell $\to$ micro-jitter $\to$ $100\text{ms}$ pre-detonation whiteout contraction ($0.80$) | Custom `tweens.chain` with non-uniform `scaleX`/`scaleY`, angle jitter, and white flash tint |
| **3. Explosion Trauma & Hit-Stop** | Default `cameras.main.shake(150, 0.008)` | Unified `CameraTraumaSimulator` ($T^2$ decay) + debounced $30\text{--}50\text{ms}$ physics hit-stop | Call `this.cameraTrauma.addTrauma(0.35)`; `physics.world.pause()` with $150\text{ms}$ debounce |
| **4. Particle Emitters** | Ad-hoc `add.rectangle` & `add.circle` per destruction | 3 pre-allocated Zero-GC Phaser `ParticleEmitter` pools (walking dust, bomb sparks, tumbling debris) | `this.add.particles()` with `emitting: false`, triggered via `emitter.explode(count, x, y)` |
| **5. Dynamic Drop Shadows** | Static baked SVG shadows | Dedicated procedural radial ellipse shadow layer at depth 6; 2.5D block occlusion; item hover shadows | Procedural `'shadow_ellipse'` texture; dynamic scale/alpha modulation based on entity ground height |

---

## 5. Verification Method

### Step 1: Automated Test Suite Verification
Run the complete automated test suite to guarantee 0 regressions across all 28 existing test suites:
```bash
npm test
```
- **Expected Result:** 537 / 537 tests pass (0 failures, 0 skipped).
- **Critical Suites to Monitor:**
  - `tests/player_movement_stress.test.mjs` (must maintain exact 24x24 hitbox and zero corner snagging).
  - `tests/directional_animations.test.mjs` (must preserve animation keys and facing frames).
  - `tests/soak_10k_frames.test.mjs` (must pass 10,000 frames with $\le 0.25\text{MB}$ heap drift).
  - `tests/ultimate_skills.test.mjs` (must pass trauma engine decay invariants).

### Step 2: Code Quality & Lint Audit
Run ESLint across the codebase:
```bash
npm run lint
```
- **Expected Result:** 0 errors, 0 warnings.

### Step 3: Production Build Compilation
Run Next.js Turbopack production build:
```bash
npm run build
```
- **Expected Result:** Exit code 0, all static routes successfully prerendered.

### Step 4: Visual Inspection Checklist (Browser / DevTools)
1. **Player Movement:** When moving WASD/arrows, character noticeably bobs with footsteps ($3\text{px}$ vertical hop) and squashes slightly on ground contact. Floating name tag and HP bar remain rock-solid.
2. **Corner Turning:** Player slides smoothly around corridor corners without stopping or jittering.
3. **Bomb Detonation:** Bomb pulses with organic rhythm, jitters urgently in the final $300\text{ms}$, snaps into a sharp whiteout contraction at $1900\text{ms}$, and detonates with a punchy frame freeze followed by smooth rotational screen shake.
4. **Particles:** Walking leaves soft dust clouds; broken blocks spray tumbling terracotta shards; bomb fuses emit live yellow sparks.
5. **Drop Shadows:** Shadows remain anchored on the floor tile when entities bob, jump, or dash. Power-up items cast soft hovering shadows that contract as the item floats upward.
