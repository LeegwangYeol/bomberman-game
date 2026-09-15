# Dispatch: Worker Milestone 2 — Advanced Enemy Behavior & Overhead Name Tags

## Mission
Implement strategic enemy bomb placement with suicide-prevention escape pathfinding (`getBlastTiles`, `findEscapePathBFS`), `EVADING` state, and 2-tier overhead name tag UI.

## References
- `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/.agents/explorer_mech_ai/handoff.md`

## Owned Files
- `src/game/pathfinding.ts` (`getBlastTiles`, `findEscapePathBFS`)
- `src/game/GameScene.ts` (`EnemyState.EVADING`, `Enemy` nameTag, bomb placement, `handleEvading`, `placeEnemyBomb`, `explodeBomb` owner decrement)
- `tests/enemy_bomb_escape.test.mjs`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Requirements & Implementation Blueprint
1. In `src/game/pathfinding.ts`:
   - Export `getBlastTiles(center: GridCoord, power: number, map: number[][]): Set<string>`
   - Export `findEscapePathBFS(start: GridCoord, dangerTiles: Set<string>, map: number[][], existingBombs: Set<string>, maxSteps?: number): GridCoord[] | null`
2. In `src/game/GameScene.ts`:
   - Extend `EnemyState` with `EVADING = 'EVADING'`.
   - Update `Enemy`:
     - Name tag: assign `enemyName` from pool ("Blinky", "Pyro Slime", "Ignis", "Stalker", "Shadow" for trackers; "Grumble", "Puffball", "Blobby", "Spook", "Waddler" for normal).
     - Render `this.nameTag` at `(x, y - 19)` with dark slate pill background `rgba(15, 23, 42, 0.85)`, bold 10px monospace font, depth 16.
     - Move `this.indicator` to `(x, y - 33)` (Tier 2, depth 17) to prevent overlap.
     - Synchronize both in `updateAI` and destroy both in `destroy()`.
     - Bomb logic in `handleTracking`:
       - Trigger when within distance <= 3 or blocked near breakables, cooldown expired, and current tile has no bomb.
       - Compute `getBlastTiles` and `findEscapePathBFS`. Only drop if guaranteed escape route exists within 4 steps!
       - Drop bomb via `scene.placeEnemyBomb(this, er, ec, this.bombPower)`, transition to `EVADING`, follow escape path.
     - Implement `handleEvading`: navigate to safe tile at evasion speed (85 px/s).
   - In `GameScene`:
     - Implement `placeEnemyBomb(enemy: Enemy, row: number, col: number, power: number): boolean`:
       - Add bomb to `this.bombs` with `owner: 'enemy'`, `enemy: enemy`, `power: power`.
       - Apply visual distinction (purple/amethyst pulse tint `0xd946ef`).
       - 2000ms fuse with pulse tweens.
     - In `explodeBomb`:
       - Decrement player `activeBombs` ONLY if `owner === 'player'`.
       - If `owner === 'enemy'`, decrement enemy's active bomb count. Player's bomb capacity is untouched!
3. Create `tests/enemy_bomb_escape.test.mjs`:
   - Test `getBlastTiles` wall/block blocking and raycast range.
   - Test `findEscapePathBFS` returns valid escape path in open corridors and null in enclosed cul-de-sac.
   - Test enemy bomb capacity isolation from player `activeBombs`.
   - Test name tag and indicator distinct vertical offsets.
4. Run `npm test` and `npm run build`. Verify all tests pass with 0 errors.
5. Write your handoff report to `/Users/user/src/bomberman/.agents/worker_mech_ai/handoff.md`.
