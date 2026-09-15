# Dispatch: worker_refine_2

## Context & Gate Failure Remediation
Iteration 1 Gate Check failed due to a critical defect identified by Reviewer 2 (`reviewer_refine_2`):
In `src/game/GameScene.ts` lines 714–719:
```typescript
this.physics.add.overlap(this.enemies, this.explosions, (_player, enemyHit) => {
  const target = enemyHit as Phaser.GameObjects.GameObject;
  if (target.active) {
    target.destroy();
  }
});
```
In Phaser Arcade Physics, `overlap(groupA, groupB, callback)` passes `(bodyA.gameObject, bodyB.gameObject)`.
Because `groupA` is `this.enemies` and `groupB` is `this.explosions`, parameter 1 is the `Enemy` and parameter 2 is the `Explosion`.
Destroying `enemyHit` destroys the explosion sprite instead of the enemy, leaving enemies completely immune to bomb explosions!

## Mandatory Reading
- Original Request: `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- Collaboration Guide: `/Users/user/src/bomberman/COLLABORATION.md`
- Reviewer 2 Handoff: `/Users/user/src/bomberman/.agents/reviewer_refine_2/handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Tasks to Implement:
1. **Fix Enemy-Explosion Overlap Callback (`src/game/GameScene.ts`)**:
   Correct lines 714–719 so that the first parameter (`enemyObj`) is destroyed:
   ```typescript
   this.physics.add.overlap(this.enemies, this.explosions, (enemyObj) => {
     const target = enemyObj as Phaser.GameObjects.GameObject;
     if (target.active) {
       target.destroy();
     }
   });
   ```
2. **Clean up Scratch File Linter Warning**:
   In `/Users/user/src/bomberman/.agents/explorer_movement_refine/verify_corner_sliding.mjs`, remove the unused `TILE_BLOCK` variable so that `npm run lint` reports 0 errors and 0 warnings.
3. **Verification**:
   - Run `npm test` and verify all 69 tests pass.
   - Run `npm run lint` and verify 0 errors and 0 warnings.
   - Run `npm run build` and verify clean Next.js Turbopack build.
4. **Handoff**:
   Write handoff report to `/Users/user/src/bomberman/.agents/worker_refine_2/handoff.md` and send completion message to parent (`5ba8d8e8-7e3d-47e7-b8f4-049c5ea9cdec`).

## 2026-09-15T01:36:23Z
You are worker_refine_2. Your working directory is `/Users/user/src/bomberman/.agents/worker_refine_2`.

MANDATORY FIRST STEP: Read `/Users/user/src/bomberman/ORIGINAL_REQUEST.md` and `/Users/user/src/bomberman/COLLABORATION.md`. Subagents MUST read it before starting work.
Also read `/Users/user/src/bomberman/.agents/worker_refine_2/DISPATCH.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task:
1. Fix `src/game/GameScene.ts` lines 714-719: Ensure the overlap callback for `(this.enemies, this.explosions)` destroys the first parameter (`enemyObj`), which is the enemy, so that bomb explosions properly defeat enemies.
2. Remove the unused variable in `.agents/explorer_movement_refine/verify_corner_sliding.mjs` to achieve 0 lint warnings.
3. Run `npm test`, `npm run lint`, and `npm run build` to verify 100% pass and 0 errors/warnings.
4. Document results in `/Users/user/src/bomberman/.agents/worker_refine_2/handoff.md`.
When finished, send a message to parent (ID: 5ba8d8e8-7e3d-47e7-b8f4-049c5ea9cdec).
