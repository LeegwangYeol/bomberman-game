# Handoff Report: Milestone 3 — Massive Juice & Animation Upgrade

## 1. Observation
- **Direct Code Inspection**:
  - `src/game/entities/BaseEntity.ts`: Exported `applyPhysicsBodyInvariantGuard` (lines 11-40) with `MutableArcadeBody` interface, locking body dimensions to 24x24 and offsets (8,8) by overriding `updateBounds` and `updateFromGameObject`. In `updateEntity()` (lines 185-265), implemented visual bobbing (`displayOriginY = 20 - hop`), squash/stretch (`1.08/0.92` to `0.94/1.06`), 3.5° motion tilt, and depth 6 drop shadow height modulation.
  - `src/game/entities/EnemyEntities.ts`: Applied `applyPhysicsBodyInvariantGuard` to `TankEnemy` (lines 135-145) and `MiniSplitterEnemy` (lines 205-215).
  - `src/game/entities/NeutralEntities.ts`: Applied `applyPhysicsBodyInvariantGuard` to `CritterNeutral` (lines 145-155).
  - `src/game/GameScene.ts`:
    - `ensureJuiceTextures()` (lines 4050-4125): Procedural canvas generation for `particle_dust`, `particle_spark`, `particle_debris`, and `shadow_ellipse` (32x16 radial gradient).
    - `create()` (lines 770-820): Pre-allocated Zero-GC `dustEmitter`, `bombSparkEmitter`, and `blockDebrisEmitter` at `RENDER_DEPTH.DEBRIS_PARTICLES` (770), and attached player drop shadow at depth 6.
    - `triggerHitStop()` (lines 490-515): Pauses Arcade Physics world with a 150ms debounce guard (`now - this.lastHitStopMs < 150`).
    - `updatePlayerJuice()` (lines 526-577): 3px vertical hop via `displayOriginY = 20 - hop`, squash/stretch preserving area within 1%, 3.5° directional banking tilt, dust bursts, and dynamic shadow height modulation.
    - `placeBomb()`, `placeEnemyBomb()`, `placeAllyBomb()` (lines 2340-2395): 4-phase asymmetric accelerating tween chain:
      - Phase 1 (0-1000ms): 2 cycles @ 250ms half-period, `scaleX: 1.14`, `scaleY: 1.04`
      - Phase 2 (1000-1600ms): 2 cycles @ 150ms half-period, `scaleX: 1.22`, `scaleY: 0.92`, tint `0xff8844`
      - Phase 3 (1600-1900ms): 3 cycles @ 50ms half-period, `scaleX: 1.32`, `scaleY: 1.12`, angle 3.5°, tint `0xff2222`
      - Phase 4 (1900-2000ms): 100ms pre-detonation whiteout contraction, `scale: 0.80`, angle 0°, tint `0xffffff`
    - `explodeBomb()` (line 2664): Calls `this.cameraTrauma.addTrauma(0.35)` and `triggerHitStop(35)`.
    - `destroyBlock()` (lines 2825-2865): Destroys 2.5D ambient occlusion shadow (`aoShadow`), bursts 8 debris particles via `blockDebrisEmitter.explode(8, centerX, centerY)`, and triggers 45ms hit-stop when >= 3 blocks demolished.
    - `spawnItem()` (lines 3480-3515): Generates hover drop shadow at depth 3 with inverse breathing tween scaling to (0.60, 0.38) and alpha 0.22 at apex, with destroy hook.
    - `generateMap()` (lines 870-910): Adds 2.5D ambient occlusion shadows (4px south) for walls and breakable blocks at depth 1.
- **Verification Commands & Results**:
  - `node --test tests/juice_game_feel.test.mjs`: 16/16 tests pass in 235ms.
  - `npm test`: 40 test suites, 628/628 tests pass in 1.90s.
  - `npm run lint`: 0 errors (39 pre-existing warnings in other agent scratch test files).
  - `npm run build`: Next.js 16.3.5 Turbopack compilation exit code 0.

## 2. Logic Chain
1. **Separation of Physics and Visuals**: In Phaser Arcade Physics, setting scale or display origin on a sprite triggers automatic body recalculations in `updateBounds` and `updateFromGameObject`. Overriding these two methods via `applyPhysicsBodyInvariantGuard` locks the physics body hitbox dimensions (24x24) and relative offsets (8,8) permanently.
2. **Visual Hop via `displayOriginY`**: Instead of translating sprite position `y` (which would displace the collision box or cause jitter during corner navigation), modulating `displayOriginY = 20 - hop` shifts the visual sprite texture upward by up to 3px while leaving the physics body centered at tile coordinates. This completely eliminates corner snagging.
3. **Escalating Fuse Urgency**: A constant blinking fuse lacks tension. Dividing the 2000ms fuse into 4 accelerating phases (half-periods 250ms -> 150ms -> 50ms) creates tactile escalation. The final 100ms whiteout contraction (scale 0.80, tint 0xffffff) provides an anticipation "gasp" right before the blast wave expands.
4. **Non-linear Camera Trauma & Debounced Hit-Stop**: Replacing direct camera shake with `cameraTrauma.addTrauma(0.35)` feeds into the existing $T^2$ trauma model with calibrated decay. Pausing the physics world via `triggerHitStop(35-70ms)` delivers tactile impact upon detonation and block destruction. A 150ms debounce guard prevents frame freezes or physics stutter during dense chain reactions.
5. **Zero-GC Particle & Shadow Management**: Instantiating particles or shadow sprites per frame triggers garbage collection spikes. Pre-allocating `dustEmitter`, `bombSparkEmitter`, and `blockDebrisEmitter` in `create()` and recycling existing instances through internal pools ensures 60 FPS performance without memory allocation overhead.
6. **2.5D Depth Layering**: Grounding shadows under entities (depth 6) and items (depth 3) beneath their sprites, alongside 2.5D ambient occlusion shadows under blocks (depth 1), establishes rich spatial depth without interfering with gameplay readability.

## 3. Caveats
- No caveats. The implementation directly satisfies all five specifications in Milestone 3, preserves full backward compatibility with all 39 existing test suites, introduces zero regressions, and compiles cleanly with zero lint errors and zero build failures.

## 4. Conclusion
Milestone 3: Massive Juice & Animation Upgrade is complete and verified:
1. Movement squash/stretch and 3px bobbing via `displayOriginY` modulation with physics body invariant guard prevents corner snagging.
2. 4-phase asymmetric bomb pulse with 100ms pre-detonation whiteout contraction is live and tested.
3. Explosion camera trauma (`addTrauma(0.35)`) and debounced graduated hit-stop (35-70ms) are integrated.
4. Zero-GC particle emitters for dust, sparks, and debris are pre-allocated and operational.
5. Dynamic drop shadows (depth 6), item hover shadows (depth 3), and block 2.5D ambient occlusion (depth 1) provide consistent visual hierarchy.
6. `tests/juice_game_feel.test.mjs` provides 16 automated verification tests covering all core behavior and invariants.

## 5. Verification Method
- **Run Unit & Integration Tests**:
  ```bash
  node --test tests/juice_game_feel.test.mjs
  npm test
  ```
  Expected output: 628 tests pass (0 failures).
- **Run Static Analysis**:
  ```bash
  npm run lint
  ```
  Expected output: 0 errors.
- **Run Production Build**:
  ```bash
  npm run build
  ```
  Expected output: Next.js Turbopack build succeeds with exit code 0.
- **Files to Inspect**:
  - `src/game/GameScene.ts`
  - `src/game/entities/BaseEntity.ts`
  - `src/game/entities/EnemyEntities.ts`
  - `src/game/entities/NeutralEntities.ts`
  - `tests/juice_game_feel.test.mjs`
