# Task Assignment: Worker 3 (Milestone 3 — Massive Juice & Animation Upgrade)

## Context Files (Read First)
- `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- `/Users/user/src/bomberman/.agents/orchestrator_game_feel/SCOPE.md`
- `/Users/user/src/bomberman/.agents/explorer_juice_1/handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## File Ownership
You exclusively own and may modify:
- `src/game/GameScene.ts` (Juice pipeline: tweens, camera trauma, hit-stop, particle emitters, drop shadows)
- `src/game/entities/BaseEntity.ts` (Physics body invariant guard & visual bobbing hooks)
- `tests/juice_game_feel.test.mjs` (New test suite for juice mechanics)

## Core Implementation Requirements
1. **Movement Squash-and-Stretch & Bobbing**:
   - Modulate visual `displayOriginY = 20 - bobOffset` during movement ($3\text{px}$ hop).
   - Apply footstep squash/stretch ($\text{scaleX}: 1.08, \text{scaleY}: 0.92 \leftrightarrow 0.94, 1.06$) and $3.5^\circ$ motion tilt.
   - **Physics Invariant Guard**: Freeze the Arcade physics body against scale changes by overriding `body.updateBounds` and `body.updateFromGameObject` on entity sprites so hitbox remains strictly $24 \times 24\text{px}$ at corridor center without corner snagging.
2. **Punchy Bomb Pulsing**:
   - 4-phase asymmetric heartbeat tween chain:
     - Phase 1 (0–1000ms): Asymmetric organic pulse (`scaleX: 1.14, scaleY: 1.04` $\leftrightarrow$ `scaleX: 0.96, scaleY: 1.18`).
     - Phase 2 (1000–1600ms): Amber pressure swell (`0xff8844`).
     - Phase 3 (1600–1900ms): Rapid crimson hyper-pulse & micro-jitter (`angle: ±3.5°`, `0xff2222`).
     - Phase 4 (1900–2000ms): Critical 100ms pre-detonation contraction ($\text{scale}: 0.80$ + whiteout flash `0xffffff`).
3. **Explosion Camera Trauma & Hit-Stop**:
   - Route bomb explosions to `this.cameraTrauma.addTrauma(0.35)`.
   - Implement debounced physics hit-stop: `triggerHitStop(durationMs = 40)` pausing `physics.world` for 30–50ms with a 150ms cooldown debounce guard.
4. **Zero-GC Particle Emitters**:
   - Pre-allocate 3 unified Phaser `ParticleEmitter` pools in `create()`:
     - `dustEmitter`: walking dust puffs behind characters.
     - `bombSparkEmitter`: live fuse sparks at fuse tips.
     - `blockDebrisEmitter`: multi-tint brick shards on block destruction (`emitter.explode(8, x, y)` replacing ad-hoc `add.rectangle`).
5. **Dynamic Drop Shadows**:
   - Generate procedural `'shadow_ellipse'` radial gradient texture.
   - Place dynamic shadows under entities at depth 6 with height-reactive scale/alpha.
   - Add 2.5D southern ambient occlusion drop shadows to blocks and walls during `generateMap()`.
   - Add hovering drop shadows under items.
6. **Tests & Verification**:
   - Create `tests/juice_game_feel.test.mjs` testing all 5 juice subsystems.
   - Verify `npm test` (all 612+ tests pass).
   - Verify `npm run lint` (0 errors).
   - Verify `npm run build` (clean Turbopack build).
7. Write handoff report to `/Users/user/src/bomberman/.agents/worker_m3/handoff.md`.

## 2026-09-22T10:01:38Z
You are Worker 3. Your working directory is /Users/user/src/bomberman/.agents/worker_m3.
Read /Users/user/src/bomberman/ORIGINAL_REQUEST.md, /Users/user/src/bomberman/COLLABORATION.md, /Users/user/src/bomberman/.agents/orchestrator_game_feel/SCOPE.md, /Users/user/src/bomberman/.agents/explorer_juice_1/handoff.md, and /Users/user/src/bomberman/.agents/worker_m3/DISPATCH.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement Milestone 3: Massive Juice & Animation Upgrade:
1. Movement squash/stretch & 3px bobbing via displayOriginY modulation with physics body invariant guard (zero corner snagging).
2. 4-phase asymmetric bomb pulse with 100ms pre-detonation whiteout contraction.
3. Explosion camera trauma integration (addTrauma(0.35)) + debounced 30-50ms physics hit-stop.
4. Pre-allocated Zero-GC particle emitters for walking dust, bomb sparks, and block debris.
5. Dynamic drop shadows under entities (depth 6) with height modulation, block 2.5D ambient occlusion, and item hover shadows.
6. Author tests/juice_game_feel.test.mjs.
7. Verify npm test, npm run lint, npm run build.
Write report to /Users/user/src/bomberman/.agents/worker_m3/handoff.md and notify parent when done.
