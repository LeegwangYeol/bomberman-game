# Scope: Aggressive Enemy AI Rewrite Milestone

## Architecture & Code Boundaries
- **Algorithm & Pure Logic**: `src/game/pathfinding.ts`
  - Soft-block-aware demolition pathfinding (`findPathWithDemolition`, `findTargetBlockBFS`)
  - Safe bomb evaluation (`canSafelyPlaceBomb`, `evaluateSafeBombPlacement`)
  - Cornering / choke-point trap calculation (`findCorneringBombTile`)
  - Zero-GC typed array representations and heap-based weighted BFS
- **Enemy Entities**: `src/game/entities/EnemyEntities.ts`
  - `ChaserEnemy`: Add bomb capabilities (`canDropBombs`, `activeBombs`, `bombCooldownTimer`, `onBombExploded`), soft block demolition behavior (R1), corridor charge + cornering trap bombing (R2), and safe evasion.
  - `BomberEnemy`: Expand beyond `dist <= 3` proximity gate; add soft block demolition when separated from player (R1), corridor cornering/trapping (R2), enraged mode quick-fuse escalation, and suicide prevention.
  - Convert `export enum EnemyState` to `export const EnemyState = { ... } as const;` to ensure compatibility with Node.js `--experimental-strip-types`.
- **Game Scene Wiring**: `src/game/GameScene.ts`
  - Wire `ChaserEnemy.updateAI` to pass `dropBombCallback: (r, c, fuseMs) => this.placeEnemyBomb(child, r, c, child.bombPower, fuseMs)`.
- **Automated Test Suite**: `tests/aggressive_ai.test.mjs`
  - Scenario A: Block Demolition / Territory Expansion (detect, place bomb, evade, destroy block, traverse corridor).
  - Scenario B: Relentless Hunting (monotonic distance reduction, statistical superiority over random walk across 20 layouts).
  - Scenario C: Cornering & Trap Bombing (choke point detection, trap placement, escape to safety).
  - Scenario D: Zero Suicide Invariant (dead-end rejection, multi-bomb hazard safety).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Soft-Block-Aware Pathfinding | Pathfind through soft blocks with penalty to identify blocking block and staging tile | Aggressive AI | Explorer 1 & 2 |
| 2 | Safe Bomb Demolition Evaluation | Verify escape route exists outside hypothetical blast within 4 steps | Aggressive AI | Explorer 1, 2, 3 |
| 3 | ChaserEnemy Territory Expansion | Detect blocking blocks, place bomb, evade, destroy block, open map | Aggressive AI | R1 |
| 4 | BomberEnemy Territory Expansion | Expand bomb placement across entire arena, not just dist <= 3 | Aggressive AI | R1 |
| 5 | Relentless Hunting & Cornering | Aggressively close distance and place offensive trap bombs at choke points | Aggressive AI | R2 |
| 6 | Suicide Prevention Invariant | Never place bomb in dead end where no escape path exists | Aggressive AI | R2 / AI-04 |
| 7 | Aggressive AI Test Suite | `tests/aggressive_ai.test.mjs` covering Scenarios A, B, C, D | Aggressive AI | Acceptance Criteria |
| 8 | Zero Regressions & Zero Lint | `npm test` 100% pass, `npm run lint` 0 errors, `npm run build` pass | Aggressive AI | Acceptance Criteria |

## Interface Contracts
- `src/game/pathfinding.ts` exports:
  - `findPathWithDemolition(startIdx, targetIdx, outPath, obstacleMask, bombMask, blockPenalty)`
  - `findTargetBlockBFS(start, target, map, bombTiles)`
  - `canSafelyPlaceBomb(pos, power, map, existingBombs, maxEscapeSteps)`
  - `findCorneringBombTile(enemyPos, playerPos, map, bombTiles)`
- `EnemyEntities.ts`:
  - `ChaserEnemy.updateAI(delta, currentTime, player, map, bombTiles, dropBombCallback?)`
  - `BomberEnemy.updateAI(delta, currentTime, player, map, bombTiles, dropBombCallback?)`
  - Both implement `onBombExploded()` decrementing `activeBombs` and clearing `escapePath`.
