# BRIEFING — 2026-09-22T17:41:00+09:00

## Mission
Implement Milestone 2: UI Depth, Text Occlusion & Staggering: Unified 2.5D depth band, Centralized OverheadUIManager, Player Protection Bubble, Staggered Floating Text Queue, Reviewer 2 remediations, and 100% test/lint/build passes.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /Users/user/src/bomberman/.agents/worker_m2
- Original parent: 32290892-8279-4b5b-83b9-899ee9b22d46
- Milestone: Milestone 2: Bomberman Visual & Functional Testing and Remediation
- Milestone M2 (New): UI Depth, Text Occlusion & Staggering

## 🔒 Key Constraints
- Genuine implementations only — DO NOT CHEAT, do not hardcode test results, no dummy implementations.
- Zero console errors in final browser validation run.
- Maintain passing npm test, npm run lint, and npm run build.
- Update COLLABORATION.md for Claude collaboration guidelines.
- Preserve headless OverheadUI test invariants (`getRenderLayers()` returns -14, -22, -34, clearance 8 and 12).
- Zero lint errors, full backward compatibility.

## Current Parent
- Conversation ID: 16df783e-b15f-427a-b28b-1561d00db004
- Updated: 2026-09-22T17:41:00+09:00

## Task Summary
- **What to build**: 
  1. Unified 2.5D depth band (`RENDER_DEPTH`) with continuous dynamic Y-sorting in `GameScene.ts`.
  2. Centralized `OverheadUIManager` with AABB collision repulsion, vertical staggering, adaptive name tag LOD (full, compact, minimal) in `GameScene.ts`.
  3. Player sprite protection bubble ($R = 38\text{px}$) with smooth opacity decay.
  4. Staggered floating text queue (`FloatingTextManager`) with $+16\text{px}$ cascade.
  5. Duck-type `bombTiles` in `pathfinding.ts` and `EnemyEntities.ts` for `FlatHazardMask`.
  6. Check allies/neutrals in initial `ignoringColliders` on bombs in `GameScene.ts`.
  7. Maintain headless `OverheadUI` test invariants.
  8. Verify `npm test`, `npm run lint`, `npm run build`.
- **Success criteria**: All 562+ existing tests pass, new tests for UI depth & decluttering pass, 0 lint errors, build succeeds.
- **Interface contracts**: `/Users/user/src/bomberman/.agents/orchestrator_game_feel/SCOPE.md`
- **Code layout**: `src/game/GameScene.ts`, `src/game/entities/OverheadUI.ts`, `src/game/entities/types.ts`, `src/game/pathfinding.ts`, `src/game/entities/EnemyEntities.ts`, `tests/`

## Key Decisions Made
- [Initial]: Will implement `OverheadUIManager` and `FloatingTextManager` cleanly in `GameScene.ts` and export them for testing.
- [Initial]: In `OverheadUI.ts`, add LOD mode, custom offset storage, and smooth alpha decay while preserving reference offsets in `getRenderLayers()`.

## Artifact Index
- `/Users/user/src/bomberman/.agents/worker_m2/DISPATCH.md` — assignment specifications
- `/Users/user/src/bomberman/.agents/worker_m2/progress.md` — heartbeat and progress tracker
- `/Users/user/src/bomberman/.agents/worker_m2/handoff.md` — final completion report
- `/Users/user/src/bomberman/tests/ui_depth_declutter.test.mjs` — new comprehensive test suite for M2

## Change Tracker
- **Files modified**: Pending
- **Build status**: Baseline passed (562 tests, 0 lint errors)
- **Pending issues**: None

## Quality Status
- **Build/test result**: PASS (562/562 passed baseline)
- **Lint status**: PASS (0 errors, 39 warnings)
- **Tests added/modified**: Pending

## Loaded Skills
- None loaded
