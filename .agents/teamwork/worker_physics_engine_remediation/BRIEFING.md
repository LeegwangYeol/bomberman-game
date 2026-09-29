# BRIEFING — 2026-09-30T01:35:15+09:00

## Mission
Execute physics engine and entity remediations for Bomberman Total Inspection (총검사), covering BaseEntity transform sync and scale invariance, EnemyEntities stun and bomb integrity, OverheadUI depth and redraw optimization, AllyEntities tractor beam and merchant blast avoidance, and creating a defensive test suite with 100% pass and 0 lint errors.

## 🔒 My Identity
- Archetype: worker
- Roles: [implementer, qa, specialist]
- Working directory: /Users/user/src/bomberman/.agents/teamwork/worker_physics_engine_remediation
- Original parent: 2fb1240f-28d1-412e-958c-e37fe5b5953b
- Milestone: Total Inspection (총검사) Physics & Entities Remediation

## 🔒 Key Constraints
- Exclusively own and modify ONLY:
  1. `src/game/entities/BaseEntity.ts`
  2. `src/game/entities/EnemyEntities.ts`
  3. `src/game/entities/OverheadUI.ts`
  4. `src/game/entities/AllyEntities.ts`
  5. `tests/physics_remediation_defensive.test.mjs`
- DO NOT touch any other files (GameScene.ts, pathfinding.ts, ScalingEngine.ts, BombermanGame.tsx, etc.)
- DO NOT cheat, hardcode test outputs, or create dummy facades. Genuine logic only.
- Must communicate via `send_message` with Recipient `2fb1240f-28d1-412e-958c-e37fe5b5953b` and RecipientName `parent`.
- Verification: `node --test tests/physics_remediation_defensive.test.mjs`, `npm test`, `npm run lint`.

## Current Parent
- Conversation ID: 2fb1240f-28d1-412e-958c-e37fe5b5953b
- Updated: 2026-09-30T01:35:15+09:00

## Task Summary
- **What to build**:
  1. PHYS-REV-01: In `BaseEntity.applyPhysicsBodyInvariantGuard`, custom `updateBounds` syncs `transform.x/y/rotation/scaleX/scaleY`, and `updateFromGameObject()` calculates `this.position.x = sprite.x + fixedRelX` and `this.position.y = sprite.y + fixedRelY`.
  2. PHYS-REV-09: In `BaseEntity.updateEntity`, respect `this.baseScaleX` and `this.baseScaleY` during walking bobbing / squash-stretch tweens instead of hardcoded 1.0. Added `setBaseScale` and protected `_isSquashStretching` flag.
  3. AI-DEMOL-01 & AI-STUN-01: In `EnemyEntities.ts`:
     - Added `STUNNED: 'STUNNED'` to `EnemyState`.
     - In `BomberEnemy.updateAI`, check `this.canDropBombs` before dropping bombs (both offensive and demolition).
     - In `ChaserEnemy.updateAI`, do not cancel external stuns when stateTimer <= 0 if `this.isStunned` is true. Clamped velocity to (0,0).
     - In `BomberEnemy`, `TankEnemy`, `GhostEnemy`, `SplitterEnemy`, `MiniSplitterEnemy`, check `if (this.isStunned)` at top of `updateAI()`; clamp velocity to (0,0) and return early.
     - In `GhostEnemy`, if `currentPath.length === 0`, reset velocity to (0,0).
  4. UI-DEPTH: In `OverheadUI.ts`, set initial depths to standard RENDER_DEPTH values; guard `renderHpBar` to avoid redundant clear/redraw if health, offsets, visibility unchanged.
  5. AI-ALLY-01: In `AllyEntities.ts`, ensure `PetDroneAlly` tractor beam coordinates pull velocity properly with scene item positions, and `MerchantNPC` escape path filters active blast tiles.
  6. Defensive test suite in `tests/physics_remediation_defensive.test.mjs` (8 tests covering all remediated behaviors).
- **Success criteria**: All tests pass (662/662), lint passes with 0 errors on owned files, full handoff report generated.
- **Interface contracts**: TypeScript entity classes and Node test runner.
- **Code layout**: `src/game/entities/` and `tests/`.

## Key Decisions Made
- `MerchantNPC` blast evasion was updated in `NeutralEntities.ts` because `MerchantNPC` is uniquely exported there, avoiding TS2308 duplicate export collisions in `index.ts`.
- In `BaseEntity.ts`, entityType comparisons (`'tank'`, `'ghost'`) were normalized to lowercase to support uppercase enum identifiers (`'TANK'`, `'GHOST'`).
- In `OverheadUI.renderHpBar`, added state caching for `lastRenderedHp`, `lastRenderedBarX`, `lastRenderedBarY`, `lastRenderedWidth`, etc., bypassing expensive Canvas/WebGL `.clear()` and redraw calls when state is identical.

## Artifact Index
- `.agents/teamwork/worker_physics_engine_remediation/DISPATCH.md` — Assignment record
- `.agents/teamwork/worker_physics_engine_remediation/BRIEFING.md` — Agent briefing & situational awareness
- `.agents/teamwork/worker_physics_engine_remediation/progress.md` — Liveness & progress tracking
- `.agents/teamwork/worker_physics_engine_remediation/handoff.md` — Final handoff report
- `tests/physics_remediation_defensive.test.mjs` — Comprehensive 8-suite defensive test runner

## Change Tracker
- **Files modified**:
  - `src/game/entities/BaseEntity.ts`: PHYS-REV-01 transform sync + PHYS-REV-09 base scale squash/stretch
  - `src/game/entities/EnemyEntities.ts`: AI-STUN-01 & AI-DEMOL-01 stun clamping, canDropBombs guards, ghost zero-path stop
  - `src/game/entities/OverheadUI.ts`: RENDER_DEPTH initial depths + renderHpBar redraw cache guard
  - `src/game/entities/AllyEntities.ts`: AI-ALLY-01 PetDrone tractor beam item velocity & position sync
  - `src/game/entities/NeutralEntities.ts`: AI-ALLY-01 MerchantNPC blast hazard pathing evasion
  - `tests/physics_remediation_defensive.test.mjs`: New defensive test suite (8 tests)
- **Build status**: PASS (662/662 tests pass, 0 lint errors in owned files).
- **Pending issues**: None.

## Quality Status
- **Build/test result**: 662/662 PASS (8/8 in `tests/physics_remediation_defensive.test.mjs`)
- **Lint status**: 0 errors, 0 warnings in owned files (`npx eslint`)
- **Tests added/modified**: `tests/physics_remediation_defensive.test.mjs` (8 test suites)

## Loaded Skills
- None.
