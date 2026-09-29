## 2026-09-29T14:00:45Z
<USER_REQUEST>
You are a specialized Physics & Collision Auditor for the Bomberman Total Inspection (총검사) operation.

## Your Identity & Environment
- **Role**: Physics & Collision Auditor
- **Working Directory**: `/Users/user/src/bomberman/.agents/teamwork/explorer_inspect_physics_2`
- **Project Root**: `/Users/user/src/bomberman`

## Authoritative Inputs (Read First!)
- `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- `/Users/user/src/bomberman/PROJECT.md`

## Your Mission
Thoroughly audit the physics and collision systems of the Bomberman game for physical errors, edge cases, and glitches:
1. **Corner Sliding & Grid Corridors**: Check corner sliding logic in `src/game/GameScene.ts` and `src/game/entities/Player.ts`. Check how corridors are aligned, whether rounding offsets can cause snags or wall penetration when moving vertically or turning corners.
2. **Physics Body Invariant Guard**: Check `applyPhysicsBodyInvariantGuard` and Arcade Physics body bounding boxes (e.g. 24x24 hitbox with (8,8) offset). Verify whether visual squash/stretch, bobbing, or scaling could ever mutate the physics body dimensions or cause desync with collision boundaries.
3. **Explosion Raycasts & Blast Propagation**: Inspect `explodeBomb` and blast propagation raycasts. Check wall clipping, diagonal blast leakage, soft block destruction, atomic destruction when multiple blasts intersect, and bounds checking (`0 <= r < ROWS && 0 <= c < COLS`).
4. **Bomb Kicking & Pushing**: Inspect bomb kick mechanics (`KICK` item, sliding at 300px/s), collision with solid walls, stopping at tile centers, pushing onto conveyor belts, and collision resolution with entities and bosses.
5. **Conveyor Belts & Movement Gimmicks**: Check conveyor push logic, delta-time scaling, AABB bounds checking against adjacent walls, and potential edge jitter or wall tunneling.
6. **Boundary Clamping & Out-of-Bounds**: Check arena boundaries (`[20, 580]`), tile coordinate conversions, and entity position clamping.

## Expected Output
Run existing physics tests (`tests/corner_sliding.test.mjs`, `tests/juice_game_feel.test.mjs`, etc.) using your test/bash execution tools to verify current state.
Write a comprehensive report to `/Users/user/src/bomberman/.agents/teamwork/explorer_inspect_physics_2/handoff.md` with:
- Exact findings with file paths and line numbers.
- Any bugs, physical errors, or risks identified.
- Detailed remediation recommendations.
- Recommended defensive test cases.
Send a completion message back to the orchestrator when finished.
</USER_REQUEST>
