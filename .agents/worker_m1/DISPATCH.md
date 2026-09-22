# Task Assignment: Worker 1 (Milestone 1 — Aggressive Enemy AI & Live Demolition)

## Context Files (Read First)
- `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- `/Users/user/src/bomberman/.agents/orchestrator_game_feel/SCOPE.md`
- `/Users/user/src/bomberman/.agents/explorer_ai_1/handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## File Ownership
You exclusively own and may modify:
- `src/game/entities/EnemyEntities.ts`
- `src/game/pathfinding.ts`
- `src/game/GameScene.ts` (enemy bomb collider overlap clearance, AI dispatch loop, enemy spawn clearance)
- `tests/aggressive_ai.test.mjs`

## Core Implementation Requirements
1. **True Entity-Bomb Overlap Clearance (Arcade Physics Fix)**:
   - In `GameScene.ts`, add `ignoringColliders` Set on bombs when created.
   - In the enemy-bomb collider process callback, check `Phaser.Geom.Intersects.RectangleToRectangle(entity.body, bomb.body)`. As long as the entity's physics body intersects the bomb body, return `false` (pass through). When the entity has completely separated from the bomb body, remove it from `ignoringColliders` and return `true`.
2. **Spawn Topography Clearance**:
   - In `GameScene.ts:spawnEnemies()`, ensure spawned enemies have at least 2 connected open orthogonal corridor tiles, or clear 1 adjacent soft block so they never spawn trapped in a dead-end pocket.
3. **Multi-Angle Soft Block Targeting & Resilient Escape**:
   - In `src/game/pathfinding.ts` and `src/game/entities/EnemyEntities.ts`, increase `maxSteps` in `findEscapePathBFS` from 4 to 8.
   - Evaluate all 4 adjacent sides of a target block for safe demolition.
   - **Anti-Freeze Fallback**: If an enemy is at an approach tile and cannot safely place a bomb, it MUST NOT call `setVelocity(0, 0)` and freeze! It must wander/patrol to an adjacent open tile to re-evaluate from another angle.
4. **Aggressive Player Hunting & Cornering**:
   - In `findCorneringBombTile`, relax `playerNeighbors.length <= 2` so enemies can place offensive bombs whenever within distance <= 2 of the player with a safe escape path.
5. **Clean Up Obsolete AI Code**:
   - Remove obsolete duplicate `Enemy` class in `GameScene.ts` (lines 150-650). Standardize AI loop calls to pass correct delta and bomb callback.
6. **Real Production Tests in `tests/aggressive_ai.test.mjs`**:
   - Test real `ChaserEnemy` and `BomberEnemy` entities and pathfinding functions on live map grids, proving real bomb placement, soft block demolition, and player pursuit.
7. **Verification**:
   - Run `npm test` (all tests must pass).
   - Run `npm run lint` (0 errors).
   - Run `npm run build` (success).
8. Write detailed handoff report to `/Users/user/src/bomberman/.agents/worker_m1/handoff.md`.

## 2026-09-22T08:04:58Z
User Request:
Implement Milestone 1: Aggressive Enemy AI & Live Demolition Loop:
1. Fix Arcade Physics bomb separation boundary lock via ignoringColliders Set & AABB check.
2. Fix spawn topography dead ends in spawnEnemies().
3. Add multi-angle soft block targeting, 8-step escape BFS, and anti-freeze fallback patrol in pathfinding.ts and EnemyEntities.ts.
4. Enhance aggressive cornering & player hunting in findCorneringBombTile.
5. Clean up obsolete duplicate Enemy class in GameScene.ts.
6. Upgrade tests/aggressive_ai.test.mjs to test real production entities and demolition loop.
7. Run npm test, npm run lint, npm run build and verify all pass.
Write your detailed report to /Users/user/src/bomberman/.agents/worker_m1/handoff.md and send a completion message to parent.

