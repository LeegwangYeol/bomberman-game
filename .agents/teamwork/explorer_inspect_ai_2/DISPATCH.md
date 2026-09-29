## 2026-09-29T14:00:45Z
<USER_REQUEST>
You are a specialized AI & Pathfinding Auditor for the Bomberman Total Inspection (총검사) operation.

## Your Identity & Environment
- **Role**: AI & Pathfinding Auditor
- **Working Directory**: `/Users/user/src/bomberman/.agents/teamwork/explorer_inspect_ai_2`
- **Project Root**: `/Users/user/src/bomberman`

## Authoritative Inputs (Read First!)
- `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- `/Users/user/src/bomberman/PROJECT.md`

## Your Mission
Thoroughly audit the AI and pathfinding systems across all entities (Enemies, Bosses, Allies, NPCs):
1. **Aggressive Demolition & Block Targeting**: Audit how enemies (e.g., `ChaserEnemy`, `BomberEnemy`, `BaseEnemy`) locate destructible soft blocks, evaluate bomb placement coordinates, and trigger bomb drops. Ensure bombs are physically dropped in live gameplay and separation lock is bypassed via `ignoringColliders`.
2. **Suicide Prevention & Escape BFS**: Inspect `findEscapePathBFS` and blast zone hazard masks (`getBlastTiles`, `FlatHazardMask`). Check if enemies ever place bombs in cul-de-sacs or when no escape path is available. Check the 8-step BFS search depth and ensure zero suicide rate.
3. **Anti-Freeze Fallback & Stun Handling**: Verify that if escape paths or player pursuit paths are temporarily blocked, enemies fall back to open tile patrols rather than freezing or vibrating. Check stun duration synchronization (`EnemyState.STUNNED`) and recovery.
4. **Enemy Variants**: Inspect `SplitterEnemy` (mini-slime spawn bounds checking), `GhostEnemy` (Ether Dash velocity preservation), `PetDrone` (tractor beam delta scaling), and `MerchantNPC` (blast escape logic).
5. **Boss AI & Multi-Phase Mechanics**: Check `BaseBoss`, `KingGummyBear`, `MechaHamster`, and `QueenBeeCupcake`. Verify phase transitions, enrage triggers, telegraph warnings, and boss movement collision invariants.
6. **Allies & Neutrals**: Audit ally pathfinding and targeting to ensure allies don't trap the player or attack invalid targets.

## Expected Output
Run existing AI tests (`tests/aggressive_ai.test.mjs`, `tests/pathfinding.test.mjs`, etc.) to verify current behavior.
Write a comprehensive report to `/Users/user/src/bomberman/.agents/teamwork/explorer_inspect_ai_2/handoff.md` with:
- Exact findings with file paths and line numbers.
- Any bugs, logic errors, or edge cases found.
- Concrete remediation steps.
- Recommended defensive tests.
Send a completion message back to the orchestrator when finished.
</USER_REQUEST>
