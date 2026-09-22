# BRIEFING — 2026-09-22T09:55:00Z

## Mission
Implement Milestone 2 (UI Depth, Text Occlusion & Staggering): unified 2.5D RENDER_DEPTH band, OverheadUIManager with AABB repulsion, adaptive LOD, player protection bubble, staggered floating text cascade, and duck-typed hazard masks.

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: /Users/user/src/bomberman/.agents/worker_m2_replace
- Original parent: 16df783e-b15f-427a-b28b-1561d00db004
- Milestone: M2 (UI Depth, Text Occlusion & Staggering)

## 🔒 Key Constraints
- Integrity Mandate: No hardcoded test results or dummy/facade implementations.
- Preserve headless OverheadUI test invariants (reference offsets -14, -22, -34).
- Duck-type bombTiles across Set<string>, Uint8Array, and FlatHazardMask.
- Verify npm test, npm run lint, and npm run build before handoff.

## Current Parent
- Conversation ID: 16df783e-b15f-427a-b28b-1561d00db004
- Updated: 2026-09-22T09:55:00Z

## Task Summary
- **What to build**: Unified RENDER_DEPTH hierarchy in types.ts, OverheadUIManager with AABB repulsion, vertical staggering, and adaptive LOD in GameScene.ts, Player Sprite Protection Bubble (R = 38px), Staggered Floating Text Queue (+16px cascade), duck-typing in pathfinding and entities, headless OverheadUI invariant preservation.
- **Success criteria**: 100% test pass (584 tests), 0 lint errors, clean production build (npm run build).
- **Interface contracts**: /Users/user/src/bomberman/.agents/orchestrator_game_feel/SCOPE.md
- **Code layout**: src/game/entities/types.ts, src/game/pathfinding.ts, src/game/entities/OverheadUI.ts, src/game/GameScene.ts, tests/ui_depth_declutter.test.mjs

## Key Decisions Made
- Centralized 2.5D depth band in `RENDER_DEPTH` (ground -10..9, dynamic entities 100 + y*1.0 + sub-offsets, VFX 750..770, Boss 800..810, UI 900..950).
- OverheadUIManager handles continuous dynamic Y-sorting for all entities & player, AABB collision repulsion (overlapX / 2), vertical staggering (-14px / +46px) when horizontally aligned (dx < 24px), arena clamping [20, 580], adaptive LOD (full > 70px, compact <= 70px, minimal for 3+ melee cluster <= 60px), and player protection bubble (R = 38px with smooth lerp decay).
- In OverheadUI.ts, getRenderLayers(includeOffsets = false) retains reference offsets (-14, -22, -34) for backwards compatibility with headless unit tests.
- FloatingTextManager tracks pickup origins and stacks vertical cascade offsets (+16px per recent pickup <= 450ms within 30px).
- Duck-typed coordinate checking via isTileInHazardMask and cloneBombTilesAsSet safely unifies Set<string>, Uint8Array, and FlatHazardMask.

## Change Tracker
- **Files modified**:
  - `src/game/entities/types.ts`: Added RENDER_DEPTH hierarchy and NameTagLODMode.
  - `src/game/pathfinding.ts`: Added isTileInHazardMask, cloneBombTilesAsSet, getSafeDemolitionApproaches, findOffensiveBombTile.
  - `src/game/entities/OverheadUI.ts`: Added adaptive LOD, custom offsets, alpha, setDepth, backwards-compatible getRenderLayers.
  - `src/game/entities/BaseEntity.ts`: Fixed TS type-only imports for Node execution.
  - `src/game/entities/EnemyEntities.ts`: Duck-typed bombTiles across all 6 enemy classes.
  - `src/game/entities/AllyEntities.ts`: Duck-typed bombTiles and fixed type imports.
  - `src/game/entities/NeutralEntities.ts`: Duck-typed bombTiles and fixed type imports.
  - `src/game/entities/index.ts`: Fixed type imports.
  - `src/game/GameScene.ts`: Integrated OverheadUIManager, FloatingTextManager, RENDER_DEPTH constants, and bomb ignoringColliders.
  - `tests/ui_depth_declutter.test.mjs`: Added comprehensive 22-test verification suite covering all 8 tiers.
- **Build status**: PASS (584/584 tests pass, 0 lint errors, clean next build).
- **Pending issues**: None.

## Quality Status
- **Build/test result**: PASS (584 tests pass across all test suites, 0 failures).
- **Lint status**: 0 errors (clean).
- **Tests added/modified**: 22 new tests in tests/ui_depth_declutter.test.mjs.
