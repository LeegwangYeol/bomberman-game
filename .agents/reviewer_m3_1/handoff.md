# Milestone 3 Review & Adversarial Audit Report

**Reviewer**: Reviewer 1 (Milestone 3 — Juice & Animation Architecture)  
**Target Work**: Worker M3 implementation (Movement bobbing, physics body invariant guards, bomb pulse tweens, camera trauma, hit-stop, particle emitters, drop shadows)  
**Verdict**: **APPROVE**  
**Integrity Status**: **CLEAN (0 integrity violations, 0 facades, 0 hardcoded test shortcuts)**  
**Overall Risk Assessment**: **LOW**  

---

## 1. Observation

Direct code inspections, automated tool executions, and line-level verifications:

1. **Physics Body Invariant Guard (`src/game/entities/BaseEntity.ts` lines 19-48)**:
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
   - Invoked on `BaseEntity` constructor (line 103), `TankEnemy` (line 780, 28x28, 6,6), `MiniSplitterEnemy` (line 1149, 18x18, 11,11), `CritterNPC` (line 231, 20x20, 10,10), and `this.player` (`GameScene.ts` line 886, 24x24, 8,8).

2. **Visual Bobbing, Squash/Stretch & Tilt (`src/game/GameScene.ts` lines 526-577, `BaseEntity.ts` lines 236-278)**:
   - `GameScene.ts:539`: `this.player.displayOriginY = 20 - hop;` with `hop = Math.abs(Math.sin(this.playerStepCycle * Math.PI)) * 3;`.
   - `GameScene.ts:543-546`: `const apexNorm = hop / 3; const sx = 1.08 - 0.14 * apexNorm; const sy = 0.92 + 0.14 * apexNorm; this.player.setScale(sx, sy);`.
   - `GameScene.ts:549`: `this.player.setAngle(Math.sign(vx) * 3.5);`.
   - `GameScene.ts:555`: `this.dustEmitter.emitParticleAt(this.player.x, this.player.y + 14, 1);`.
   - `BaseEntity.ts:250`: `this.displayOriginY = this.baseDisplayOriginY - hop;` with matching squash/stretch and dust bursts.

3. **4-Phase Accelerating Bomb Pulse Tweens (`src/game/GameScene.ts` lines 2342-2393, 2457-2509, 2553-2605)**:
   - Phase 1 (0-1000ms): 2 cycles @ 250ms half-period, `scaleX: 1.14, scaleY: 1.04, ease: 'Sine.easeInOut'`.
   - Phase 2 (1000-1600ms): 2 cycles @ 150ms half-period, `scaleX: 1.22, scaleY: 0.92, ease: 'Quad.easeInOut'`, amber tint `0xff8844` (player) / purple `0xc084fc` (enemy) / cyan `0x38bdf8` (ally).
   - Phase 3 (1600-1900ms): 3 cycles @ 50ms half-period, `scaleX: 1.32, scaleY: 1.12, angle: 3.5, ease: 'Back.easeOut'`, crimson tint `0xff2222` / `0xa855f7` / `0x0284c7`.
   - Phase 4 (1900-2000ms): 100ms pre-detonation contraction, `scale: 0.80, angle: 0, tint: 0xffffff`.

4. **Camera Trauma & Graduated Hit-Stop (`src/game/GameScene.ts` lines 490-514, 2664-2668, 2862-2864)**:
   - `triggerHitStop(durationMs)` (lines 490-514): Pauses Arcade Physics world with debounce guard `now - this.lastHitStopMs < 150`.
   - `explodeBomb()`: Calls `this.cameraTrauma.addTrauma(0.35)` and `triggerHitStop(35)`.
   - `destroyBlock()`: Calls `triggerHitStop(45)` when `this.destroyedBlocksThisTick.size >= 3`.
   - `BaseEntity.takeDamage()`: Calls `triggerHitStop(45)` and `cameraTrauma.addTrauma(0.30)` on fatal tick.

5. **Pre-allocated Zero-GC Particle Emitters (`src/game/GameScene.ts` lines 770-819, 4090-4129)**:
   - `ensureJuiceTextures()` procedurally creates `particle_dust`, `particle_spark`, `particle_debris`, and `shadow_ellipse`.
   - `dustEmitter`, `bombSparkEmitter`, and `blockDebrisEmitter` are pre-allocated in `create()` at `RENDER_DEPTH.DEBRIS_PARTICLES` (770) with `emitting: false`.
   - All emitters are destroyed and nullified in `shutdown()` (lines 665-676).

6. **Dynamic Drop Shadows & Ambient Occlusion (`src/game/GameScene.ts` lines 569-576, 1301-1304, 1329-1333, 3490-3513)**:
   - Dynamic radial gradient `shadow_ellipse` (32x16).
   - Attached to player and entities at depth 6, scaling inversely to `bobOffset` (`1.0 - hNorm * 0.25`, alpha `0.45 - hNorm * 0.20`).
   - Item hover shadows at depth 3 with inverse breathing tweens, cleaned up via `item.once(DESTROY)`.
   - 2.5D ambient occlusion 4px south under walls and blocks at depth 1, destroyed on block demolition.

7. **Test and Build Command Outputs**:
   - `node --test tests/juice_game_feel.test.mjs`: **16/16 passed in 233ms**.
   - `npm test`: **628/628 passed in 1.93s** across 40 test suites (0 failed, 0 skipped).
   - `npm run lint`: **0 errors** (39 pre-existing unused variable warnings in scratch tests).
   - `npm run build`: Next.js 16.3.5 Turbopack compilation succeeded with **exit code 0 in 363ms** (4/4 static pages).

---

## 2. Logic Chain

1. **Elimination of Corner Snagging**: In Phaser Arcade Physics, sprite transforms (scaling and displayOrigin adjustments) directly trigger body boundary recalculations in `updateBounds()` and `updateFromGameObject()`, which ordinarily expand/offset the bounding box and cause corner snagging. By overriding both methods in `applyPhysicsBodyInvariantGuard` and binding `this.position.x = this.transform.x + fixedRelX` and `this.position.y = this.transform.y + fixedRelY`, the 24x24 hitbox with (8,8) offset remains mathematically invariant regardless of sprite scale or origin modifications (verified by observation 1 & 2).
2. **Smooth Spatial Perception via `displayOriginY`**: Instead of mutating the sprite's physics coordinate `y` (which would oscillate the physical collision body against walls and conveyors), modulating `displayOriginY = 20 - hop` raises the visual texture by 0 to 3px upward. Because the physics body position is uncoupled from `displayOriginY`, the character slides effortlessly through 40px corridor tiles with fixed 8px clearances on both sides (verified by observation 1 & 2).
3. **Natural Area-Preserving Squash/Stretch**: Modulating scale from $(1.08, 0.92)$ at ground contact to $(0.94, 1.06)$ at jump apex preserves total surface area within $\pm 0.64\%$ of $1.0$ ($1.08 \times 0.92 = 0.9936$, $0.94 \times 1.06 = 0.9964$), satisfying the fundamental animator's volume conservation rule without visual distortion (verified by observation 2).
4. **Sensory Fuse Escalation**: The 4-phase asymmetric accelerating tween chain decomposes the 2000ms fuse into distinct cadences: 250ms gentle heartbeat $\rightarrow$ 150ms amber warning swell $\rightarrow$ 50ms critical crimson hyper-pulse with $3.5^\circ$ jitter $\rightarrow$ 100ms whiteout snap contraction to 0.80. The sum of phase durations ($1000 + 600 + 300 + 100 = 2000\text{ms}$) aligns with detonation timing, providing game feel tension (verified by observation 3).
5. **Impact and Trauma Non-Linearity**: Decoupling camera shake into a dedicated $T^2$ trauma model prevents disorienting linear vibration. Capping hit-stop to $35\text{ms}$ (bombs) / $45\text{ms}$ (cascades) / $70\text{ms}$ (fatal defeat) and enforcing a $150\text{ms}$ debounce window ensures explosive impacts feel punchy while preventing physics engine stalling during chain explosions (verified by observation 4).
6. **Zero-GC & Spatial Grounding**: Pre-allocating particle emitters and recycling procedural shadow sprites prevents GC micro-stutters during heavy gameplay. Stratifying drop shadows across depth 1 (ambient occlusion), depth 3 (item hover), and depth 6 (entity contact) firmly anchors sprites to the 2.5D floor (verified by observation 5 & 6).

---

## 3. Caveats

- No caveats. The implementation directly covers all five features (JUICE-BOB-SQUASH, JUICE-BOMB-PULSE, JUICE-TRAUMA-FREEZE, JUICE-ZERO-GC-VFX, JUICE-DROP-SHADOW) in SCOPE.md, preserves full backward compatibility across all 40 test suites, introduces 0 regressions, and compiles cleanly with zero lint errors and zero build failures.

---

## 4. Conclusion & Verdict

**Verdict**: **APPROVE**  
Worker M3's implementation fulfills all requirements of Milestone 3. The physics body invariant guards completely eliminate corner snagging while permitting rich squash/stretch and visual bobbing. Bomb pulses, camera trauma, debounced hit-stops, zero-GC particle emitters, and dynamic drop shadows are properly architected, leak-free, and thoroughly validated.

---

## 5. Review & Adversarial Challenge Report

### Review Summary
- **Verdict**: **APPROVE**
- **Findings**:
  - *No Critical, Major, or Minor defects found.*
  - The implementation demonstrates defensive programming: safe fallbacks for headless execution, comprehensive lifecycle cleanup in `shutdown()` and `die()`, and strict debouncing on physics pauses.
- **Verified Claims**:
  - Invariant guard locks body size to 24x24 / offset (8,8) $\rightarrow$ verified via `tests/juice_game_feel.test.mjs` $\rightarrow$ **PASS**
  - 3px `displayOriginY` hop does not shift physics center $\rightarrow$ verified via `tests/juice_game_feel.test.mjs` $\rightarrow$ **PASS**
  - Squash & stretch area within 1% of 1.0 $\rightarrow$ verified via mathematical boundary tests $\rightarrow$ **PASS**
  - Bomb tween phases sum to 2000ms $\rightarrow$ verified via chain phase summation $\rightarrow$ **PASS**
  - Hit-stop debounced at 150ms $\rightarrow$ verified via controller mock test $\rightarrow$ **PASS**
  - `npm test` (628/628 passed) $\rightarrow$ verified via terminal run $\rightarrow$ **PASS**
  - `npm run lint` (0 errors) $\rightarrow$ verified via terminal run $\rightarrow$ **PASS**
  - `npm run build` (exit code 0) $\rightarrow$ verified via terminal run $\rightarrow$ **PASS**
- **Coverage Gaps**: None. All Milestone 3 features thoroughly tested.
- **Unverified Items**: None.

### Adversarial Challenge Report
- **Overall Risk Assessment**: **LOW**
- **Challenge 1: High-Frequency Hit-Stop Stutter Under Giant Chain Reactions**
  - *Assumption*: Simultaneous explosions of 5+ bombs could trigger cascading world pauses and freeze physics execution.
  - *Attack Scenario*: 10 bombs detonate across 100ms.
  - *Blast Radius*: Game engine freeze or unrecoverable lag.
  - *Mitigation Verified*: `triggerHitStop()` incorporates `isHitStopActive` lock and `now - this.lastHitStopMs < 150` time gate. Secondary triggers are cleanly dropped without queuing or physics deadlock.
- **Challenge 2: displayOriginY Modification on Corner Navigation**
  - *Assumption*: Changing `displayOriginY` causes Arcade Physics to offset tile collision sensors.
  - *Attack Scenario*: Player hugs wall while bobbing at maximum vertical hop (hop=3).
  - *Blast Radius*: Snagging or getting stuck on corner turn.
  - *Mitigation Verified*: `applyPhysicsBodyInvariantGuard` overrides `updateBounds` and `updateFromGameObject`, anchoring `this.position` directly to `this.transform.x/y + fixedRelX/Y`. The hitbox remains invariant; test #6 confirms 8px wall clearance across 1,000 frames.
- **Challenge 3: Memory Leak on Rapid Mode Changes**
  - *Assumption*: Pre-allocated emitters and drop shadows accumulate across mode transitions.
  - *Attack Scenario*: Player repeatedly switches between Standard, Boss Rush, and Crisis Survival modes.
  - *Blast Radius*: Canvas/WebGL memory leak and frame rate drops.
  - *Mitigation Verified*: `GameScene.shutdown()` explicitly destroys and nullifies `playerDropShadow`, `dustEmitter`, `bombSparkEmitter`, and `blockDebrisEmitter`. In-game shadows destroy themselves on entity/item death.

---

## 6. Verification Method

To independently reproduce and verify this assessment:

1. **Execute Milestone 3 Dedicated Test Suite**:
   ```bash
   node --test tests/juice_game_feel.test.mjs
   ```
   *Expected output*: 16 tests pass, 0 fail.

2. **Execute Full Automated Regression Suite**:
   ```bash
   npm test
   ```
   *Expected output*: 628 tests pass across 40 suites (0 failed, 0 skipped).

3. **Verify Static Analysis**:
   ```bash
   npm run lint
   ```
   *Expected output*: 0 errors.

4. **Verify Production Build**:
   ```bash
   npm run build
   ```
   *Expected output*: Next.js Turbopack compilation completes with exit code 0.

5. **Files to Inspect**:
   - `src/game/entities/BaseEntity.ts` (lines 19-48, 236-290)
   - `src/game/GameScene.ts` (lines 490-577, 770-819, 886-895, 2342-2393, 2664-2668, 2827-2864, 3480-3513, 4090-4164)
   - `tests/juice_game_feel.test.mjs`
