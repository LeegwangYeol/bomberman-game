# Dispatch: worker_refine

## Role & Mandate
You are `worker_refine`. Your working directory is `/Users/user/src/bomberman/.agents/worker_refine`.
You are the primary implementation worker responsible for executing the Bomberman prototype refinement across all 3 core requirements (R1, R2, R3).

## Mandatory Reading
1. `/Users/user/src/bomberman/ORIGINAL_REQUEST.md` (Mandatory verbatim user requirements)
2. `/Users/user/src/bomberman/COLLABORATION.md`
3. Explorer Reports:
   - `/Users/user/src/bomberman/.agents/explorer_movement_refine/handoff.md` (Movement & Hitbox Analysis)
   - `/Users/user/src/bomberman/.agents/explorer_enemies_refine/handoff.md` (Enemy AI States & Visuals)
   - `/Users/user/src/bomberman/.agents/explorer_bombs_refine/handoff.md` (Bomb Tweens & Explosion Impact)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Detailed Tasks to Implement in `src/game/GameScene.ts`

### 1. Hitbox & Physics Adjustments (R1)
- Player Body: Set size to `24, 24` with offset `8, 8` in `GameScene.ts:create()`.
- Bomb Body: Set size to `32, 32` with offset `4, 4` in `GameScene.ts:placeBomb()`.
- Enemy Body: Set size to `24, 24` with offset `8, 8` in `Enemy` constructor and spawn loops.

### 2. Smooth Movement & Corner-Sliding (R1)
- Replace lines 448-465 in `GameScene.ts:update()` with the robust `updatePlayerMovement()` method from `explorer_movement_refine/handoff.md §4.1`:
  - Phase 1: Corridor Centering Assist (when path ahead is open, smooth pull toward center).
  - Phase 2: Corner-Rounding Assist (when turning into adjacent open corridor past pillar/wall corners).
  - Phase 3: Dead-End Protection (no sideways ghost sliding into flat walls).
  - Phase 4: Diagonal/Multi-Input Resolution (prioritize open axis over wall-blocked axis).
  - Bomb passability: allow player to step off the tile where they just placed a bomb without getting stuck.

### 3. Lively Enemies & Visual AI Feedback (R2)
- Expand `EnemyState` enum in `GameScene.ts`: `IDLE`, `PATROL`, `TRACKING`, `HUNTING`, `WINDUP`, `ATTACK`, `COOLDOWN`.
- Add companion `indicator!: Phaser.GameObjects.Text` above enemy head (`x, y - 24`), depth 15.
- Add `changeState(newState)` and `applyStateVisuals(state)` with:
  - `IDLE`: breathing squash & stretch tween + `...` text.
  - `PATROL`: walking waddle angle tween + footstep dust particle circles.
  - `TRACKING` / `HUNTING`: alert tint + bouncing `!` indicator + sprint waddle.
  - `WINDUP`: pre-charge shiver compression tween + `⚠️` indicator + red tint.
  - `ATTACK`: stretched sprint along attack axis + smoke trail particles + `⚡`.
  - `COOLDOWN`: squashed pancake bounce + rotating `💫` indicator + blue tint.
- Fix attack vector calculation when player and enemy share tile (`Math.sign(dx) || ...`).
- Override `destroy(fromScene)` in `Enemy` to clean up indicator and stop tweens.
- Add `spawnParticle(x, y, radius, color, alpha)` using `scene.add.circle()`.

### 4. Dynamic Bomb Tweens & High-Impact Explosions (R3)
- In `placeBomb()`: Implement the 3-stage accelerating pulse tween chain using `this.tweens.chain(...)`:
  - Stage 1 (0-1000ms): 250ms half-period, 1.15x scale, rhythmic pulse.
  - Stage 2 (1000-1600ms): 150ms half-period, 1.25x scale, amber tint `0xff8866`.
  - Stage 3 (1600-2000ms): 65ms half-period, 1.35x scale, critical red flash `0xff2222`.
  - Save `fuseTimer` and `tweenChain` in `bomb.setData()`.
- In `explodeBomb()`:
  - Clean up timer & tween before destroying bomb.
  - Camera shake `(150, 0.008)`.
  - Screen flash `cameras.main.flash(80, 255, 230, 160)`.
  - Expanding shockwave vector ring with `this.add.graphics()` and counter tween.
  - Epicenter vs arm explosion tint and bloom easing (`Back.easeOut`).
- In `destroyBlock()`: Spawn 4 debris fragments with `add.rectangle` flying outward and fading.
- Centralize explosion group overlaps in `create()`.

### 5. Verification & Testing
- Run `npm test` to verify all tests pass.
- Run `npm run lint` to verify 0 ESLint errors.
- Run `npm run build` to verify 0 TypeScript/Turbopack compilation errors.
- Document all changes and verification outputs in `/Users/user/src/bomberman/.agents/worker_refine/handoff.md`.

## 2026-09-15T01:26:48Z
You are worker_refine. Your working directory is `/Users/user/src/bomberman/.agents/worker_refine`.

MANDATORY FIRST STEP: Read `/Users/user/src/bomberman/ORIGINAL_REQUEST.md` and `/Users/user/src/bomberman/COLLABORATION.md`. Subagents MUST read it before starting work.
Also read `/Users/user/src/bomberman/.agents/worker_refine/DISPATCH.md`.

Your task:
Implement the full refinement in `src/game/GameScene.ts` as specified in `/Users/user/src/bomberman/.agents/worker_refine/DISPATCH.md`:
1. R1: Hitbox sizing (24x24 for player/enemy, 32x32 for bomb) & corner-sliding / corridor centering logic (`updatePlayerMovement()`).
2. R2: Lively enemy visual AI states (`IDLE`, `PATROL`, `TRACKING`, `HUNTING`, `WINDUP`, `ATTACK`, `COOLDOWN`), companion indicators, procedural animations (squash & stretch, waddle, shiver, stretch, dizzy stars), and particles.
3. R3: Multi-stage accelerating bomb ticking tween chain (250ms -> 150ms -> 65ms/1.35x), 5-layer explosion impact (flash, shake, vector shockwave ring, bloom, debris), and clean timer/tween lifecycle management.
4. Run `npm test`, `npm run lint`, and `npm run build` to verify 0 errors.

Write your handoff report to `/Users/user/src/bomberman/.agents/worker_refine/handoff.md`.
When finished, send a message to parent (ID: 5ba8d8e8-7e3d-47e7-b8f4-049c5ea9cdec).

