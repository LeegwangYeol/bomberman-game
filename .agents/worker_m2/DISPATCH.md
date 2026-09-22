# Task Assignment: Worker 2 (Milestone 2 — UI Depth, Text Occlusion & Staggering)

## Context Files (Read First)
- `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- `/Users/user/src/bomberman/.agents/orchestrator_game_feel/SCOPE.md`
- `/Users/user/src/bomberman/.agents/explorer_ui_1/handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## File Ownership
You exclusively own and may modify:
- `src/game/entities/OverheadUI.ts`
- `src/game/entities/types.ts`
- `src/game/GameScene.ts` (OverheadUIManager, RENDER_DEPTH, floating text cascade, bombTiles duck-typing)
- `src/game/pathfinding.ts` (duck-type bombTiles for FlatHazardMask)
- `src/game/entities/EnemyEntities.ts` (duck-type bombTiles for FlatHazardMask)
- `tests/` (add tests for UI depth, decluttering, and occlusion)

## Core Implementation Requirements
1. **Unified 2.5D Depth Band Hierarchy (`RENDER_DEPTH`)**:
   - In `GameScene.ts`, define and apply standard depth constants with continuous dynamic Y-sorting:
     `depth = 100 + y + subOffset` (where subOffset separates shadow, sprite, HP, name tag, intent badge).
   - Ensure explosion flames (750), shockwaves, and bosses (800) render cleanly above minion labels.
2. **Centralized `OverheadUIManager` (Declutter Engine)**:
   - In `GameScene.ts`, implement `OverheadUIManager`:
     - Evaluates active overhead UI labels per frame.
     - Detects AABB intersections between labels and applies horizontal spring repulsion ($\pm \Delta x / 2$).
     - When entities are tightly stacked horizontally ($|x_i - x_j| < 24\text{px}$), use vertical staggering (under-foot offset `y + 24` or elevated tier).
     - **Adaptive Name Tag LOD**:
       - Solo mode ($d > 70\text{px}$): full name (e.g. `'Chaser: Blinky'`).
       - Clustered mode ($d \le 70\text{px}$): compact nickname (e.g. `'Blinky'`).
       - Dense melee mode ($3+$ entities within $60\text{px}$): hide text tag, show HP bar and intent badge only.
3. **Player Protection Bubble ($R = 38\text{px}$)**:
   - Any enemy/entity label within $38\text{px}$ of `(player.x, player.y)` smoothly fades down to $\alpha = 0.15$ (or $0$ if $\le 20\text{px}$), so the player sprite is never obscured.
4. **Staggered Floating Text Queue (`FloatingTextManager`)**:
   - When multiple popups spawn within $30\text{px}$ of each other in a short window ($450\text{ms}$), cascade their $Y$ coordinate upward by $+16\text{px}$ per recent active text so item pickup texts never stack into unreadable blobs.
5. **Reviewer 2 Findings Remediation**:
   - In `pathfinding.ts:1065` and `EnemyEntities.ts:360, 726`, duck-type `bombTiles`:
     `const isBomb = Boolean(bombTiles && 'has' in bombTiles && typeof (bombTiles as any).has === 'function' && (bombTiles as any).has(`${r},${c}`));`
   - In `GameScene.ts`, check allies and neutrals when populating `ignoringColliders` on bomb placement.
6. **Preserve Headless Test Invariants**:
   - In `OverheadUI.ts`, ensure `getRenderLayers()` continues to return reference clearances (`-14`, `-22`, `-34`, clearance `8` and `12`) when queried headlessly.
7. **Verification**:
   - Run `npm test` (all 562+ tests must pass).
   - Run `npm run lint` (0 errors).
   - Run `npm run build` (success).
8. Write detailed handoff report to `/Users/user/src/bomberman/.agents/worker_m2/handoff.md`.

## 2026-09-22T08:37:37Z
Task received from parent: Implement Milestone 2: UI Depth, Text Occlusion & Staggering:
1. Unified 2.5D depth band (RENDER_DEPTH) with continuous dynamic Y-sorting.
2. Centralized OverheadUIManager with AABB collision repulsion, vertical staggering, and adaptive name tag LOD (full name, compact nickname, HP/intent only).
3. Player sprite protection bubble (R = 38px) with smooth opacity decay.
4. Staggered floating text queue (+16px vertical cascade on rapid pickups).
5. Duck-type bombTiles in pathfinding.ts and EnemyEntities.ts to support FlatHazardMask.
6. Check allies/neutrals in initial ignoringColliders on bombs.
7. Maintain headless OverheadUI test invariants.
8. Verify npm test, npm run lint, npm run build.

