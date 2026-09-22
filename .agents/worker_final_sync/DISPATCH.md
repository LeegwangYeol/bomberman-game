# Task Assignment: Worker Final Sync (Milestone 4 — Final Regression, Build & Collaboration Sync)

## Context Files
- `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/.agents/orchestrator_game_feel/SCOPE.md`
- `/Users/user/src/bomberman/.agents/orchestrator_game_feel/GATE_STATUS.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Mission
1. Update `/Users/user/src/bomberman/COLLABORATION.md`:
   - Append comprehensive victory completion section under `## 2026-09-22: 게임 필(Game Feel), 주스(Juice), UI 텍스트 오클루전 & 실시간 적 AI 실전 복구 작전 완료 — VICTORY CONFIRMED`.
   - Detail the 3 major pillars:
     1. **R1. REAL Aggressive Enemy AI (CRITICAL FIX)**: `ignoringColliders` Arcade physics clearance solving separation lock; 8-step BFS escape; multi-angle block targeting; anti-freeze fallback patrol; spawn corridor clearance; real entity tests in `tests/aggressive_ai.test.mjs`.
     2. **R2. UI Depth & Text Occlusion Fix (CRITICAL)**: Unified 2.5D `RENDER_DEPTH` continuous dynamic Y-sorting; `OverheadUIManager` with AABB spring repulsion and under-foot vertical split; adaptive Name Tag LOD (solo, clustered, minimal); Player Sprite Protection Bubble ($R=38\text{px}$); Staggered Floating Text Queue (+16px cascade).
     3. **R3. Massive "Juice" & Animation Upgrade**: Movement squash/stretch & 3px bobbing via `displayOriginY` with physics body invariant guard (24x24 fixed hitbox, zero corner snagging over 1,360 corner slides); 4-phase asymmetric bomb pulse with 100ms pre-blast contraction and whiteout flash; camera trauma $T^2$ integration + debounced 35-70ms hit-stop; zero-GC particle emitters for dust, sparks, and debris; dynamic drop shadows at depth 6 with height modulation and 2.5D block ambient occlusion.
   - Include test metrics (644/644 passed across 41 test suites), 0 lint errors, clean Turbopack build.
2. Update `/Users/user/src/bomberman/PROJECT.md`:
   - Add Milestones M11 (Aggressive Enemy AI & Demolition), M12 (UI Depth & Text Occlusion), M13 (Massive Juice & Animation), M14 (Full QA & E2E Verification) with status DONE.
3. Run:
   - `npm test`
   - `npm run lint`
   - `npm run build`
4. Write handoff report to `/Users/user/src/bomberman/.agents/worker_final_sync/handoff.md`.
