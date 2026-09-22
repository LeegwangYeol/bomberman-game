# Worker Task: Aggressive Enemy AI Implementation

You are Worker 1 for the Aggressive Enemy AI Rewrite milestone.

Working Directory: /Users/user/src/bomberman/.agents/worker_aggressive_ai/
Project Root: /Users/user/src/bomberman
Authoritative Request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Scope Specification: /Users/user/src/bomberman/.agents/orchestrator_aggressive_ai/SCOPE.md

## Mandatory Explorer Handoff Reports (READ CAREFULLY FIRST):
1. `/Users/user/src/bomberman/.agents/explorer_ai_entities/handoff.md` (Enemy AI Architecture & Entity details)
2. `/Users/user/src/bomberman/.agents/explorer_ai_pathfinding/handoff.md` (Pathfinding & Demolition Dijkstra details)
3. `/Users/user/src/bomberman/.agents/explorer_ai_tests/handoff.md` (Test runner constraints & headless arena simulator design)

## Exclusive File Ownership:
You have exclusive write ownership of:
- `src/game/pathfinding.ts`
- `src/game/entities/EnemyEntities.ts`
- `src/game/GameScene.ts`
- `tests/aggressive_ai.test.mjs`

DO NOT modify files outside this set without necessity.

## MANDATORY INTEGRITY WARNING:
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Implementation Tasks:
1. **`src/game/pathfinding.ts`**:
   - Implement soft-block-aware demolition pathfinding (`findPathWithDemolition` on `ZeroGCPathfinder` and exported helper `findTargetBlockBFS` or `findDemolitionPath`). It must identify the first blocking `TILE_BLOCK` and the adjacent staging tile.
   - Implement safe bomb evaluation (`canSafelyPlaceBomb` / `evaluateSafeBombPlacement`) that checks if a safe tile outside the hypothetical blast and existing bombs is reachable within `maxEscapeSteps <= 4`.
   - Implement `findCorneringBombTile` for offensive trap bombing when player is in dead-end or corridor.
   - Ensure Zero-GC compliance (avoid runtime heap allocations).
2. **`src/game/entities/EnemyEntities.ts`**:
   - Convert `export enum EnemyState` to `export const EnemyState = { ... } as const;` and `export type EnemyState = typeof EnemyState[keyof typeof EnemyState];` so that Node.js `--experimental-strip-types` can import/strip cleanly.
   - `ChaserEnemy`: Add bomb capabilities (`canDropBombs`, `activeBombs`, `bombCooldownTimer`, `onBombExploded`, `evadeTimeoutMs`). When path to player is blocked by soft blocks, find blocking block, move to adjacent staging tile, place bomb if safe escape exists, switch to `EVADING`, and after explosion proceed. When near player, execute corridor charge or drop trap bomb.
   - `BomberEnemy`: Expand bomb logic beyond `dist <= 3`. If path to player is blocked by soft blocks across the arena, seek blocking soft block and demolish it. When cornering player in corridor, drop offensive trap bomb. Preserve enraged mode and suicide prevention.
3. **`src/game/GameScene.ts`**:
   - Wire `ChaserEnemy.updateAI` in `update()` (around line 2017) to pass `(r, c, fuseMs) => this.placeEnemyBomb(child, r, c, child.bombPower, fuseMs)`.
4. **`tests/aggressive_ai.test.mjs`**:
   - Implement comprehensive tests covering:
     - Scenario A: Block Demolition / Territory Expansion (identifies blocking soft block, places bomb, evades blast, destroys block, and traverses opened corridor).
     - Scenario B: Relentless Hunting (monotonic distance reduction, statistical superiority over random walk across 20 varied grid layouts).
     - Scenario C: Cornering & Trap Bombing (detecting trapped player in dead end, placing trap bomb at choke point, escaping safely).
     - Scenario D: Suicide Prevention Invariant (rejection of bomb drops in 1-tile, 2-tile dead ends and multi-bomb hazards).
5. **Verification**:
   - Run:
     - `node --experimental-strip-types --test tests/aggressive_ai.test.mjs`
     - `npm test` (all tests must pass, 0 regressions)
     - `npm run lint` (0 errors)
     - `npm run build` (Next.js build succeeds)
   - Record all command outputs and verification details in:
     `/Users/user/src/bomberman/.agents/worker_aggressive_ai/handoff.md`
