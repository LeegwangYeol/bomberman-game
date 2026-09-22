# Scope: Game Feel, Juice, UI Text Occlusion & Real-Time AI Overhaul

## Architecture Overview
- **AI Engine**: Continuous Arcade physics integration with dynamic bomb overlap clearance (`ignoringColliders`), multi-angle soft block targeting, 8-step BFS escape paths, anti-freeze fallback patrol, and offensive player cornering. (COMPLETED & AUDITED)
- **UI & Depth System**: Unified 2.5D depth band (`RENDER_DEPTH`), centralized `OverheadUIManager` with AABB collision repulsion, adaptive name tag LOD, player protection bubble ($R=38\text{px}$), and staggered floating text cascade. (COMPLETED & AUDITED)
- **Juice & Animation Engine**: Visual bobbing via `displayOriginY` with physics body invariant guard (zero corner snagging), 4-phase asymmetric bomb pulse with 100ms pre-detonation whiteout contraction, unified `CameraTraumaSimulator` ($T^2$ decay) with debounced hit-stop frame freeze, zero-GC particle emitters (dust, sparks, debris), and dynamic floor drop shadows. (NEXT MILESTONE: M3)

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | AI-PHYS-BOMB | Physics separation lock fix: `ignoringColliders` Set on bombs allowing seamless escape | M1 | explorer_ai_1 | DONE |
| 2 | AI-MULTI-TARGET | Multi-angle soft block targeting & 8-step escape paths in pathfinding | M1 | explorer_ai_1 | DONE |
| 3 | AI-ANTI-FREEZE | Anti-freeze fallback: wander/patrol open tiles when approach escape fails | M1 | explorer_ai_1 | DONE |
| 4 | AI-SPAWN-CLEAR | Spawn topography clearance: guaranteed open neighbors at spawn | M1 | explorer_ai_1 | DONE |
| 5 | AI-HUNT-CORNER | Relaxed offensive cornering & aggressive pursuit in open spaces | M1 | explorer_ai_1 | DONE |
| 6 | AI-REAL-TESTS | Real entity test suite in `tests/aggressive_ai.test.mjs` verifying live demolition | M1 | explorer_ai_1 | DONE |
| 7 | UI-DEPTH-BAND | Unified 2.5D `RENDER_DEPTH` hierarchy with continuous Y-sorting | M2 | explorer_ui_1 | DONE |
| 8 | UI-DECLUTTER-MGR | Centralized `OverheadUIManager` with AABB repulsion & under-foot split | M2 | explorer_ui_1 | DONE |
| 9 | UI-LOD-NAMETAG | Adaptive Name Tag LOD: full name -> compact nickname -> HP/intent only | M2 | explorer_ui_1 | DONE |
| 10| UI-PLAYER-BUBBLE | Player sprite protection bubble ($R=38\text{px}$) with smooth opacity decay | M2 | explorer_ui_1 | DONE |
| 11| UI-FLOAT-CASCADE | Staggered floating text queue (+16px vertical cascade) | M2 | explorer_ui_1 | DONE |
| 12| JUICE-BOB-SQUASH | Movement bobbing via `displayOriginY` + squash/stretch + body invariant guard | M3 | explorer_juice_1 | DONE |
| 13| JUICE-BOMB-PULSE | 4-phase asymmetric bomb pulse with 100ms pre-blast contraction & white flash | M3 | explorer_juice_1 | DONE |
| 14| JUICE-TRAUMA-FREEZE | Explosion `CameraTraumaSimulator` ($T^2$) + debounced 30-50ms hit-stop | M3 | explorer_juice_1 | DONE |
| 15| JUICE-ZERO-GC-VFX | Pre-allocated particle emitters for walking dust, bomb sparks, block debris | M3 | explorer_juice_1 | DONE |
| 16| JUICE-DROP-SHADOW | Dynamic drop shadow layer (depth 6) with height-reactive scale/alpha & block AO | M3 | explorer_juice_1 | DONE |
| 17| QA-REGRESSION-BUILD| 100% pass across all tests, 0 lint errors, clean production build | M4 | orchestrator | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Aggressive Enemy AI & Live Demolition | Features 1-6 (AI-PHYS-BOMB, AI-MULTI-TARGET, AI-ANTI-FREEZE, AI-SPAWN-CLEAR, AI-HUNT-CORNER, AI-REAL-TESTS) | none | DONE |
| M2 | UI Depth, Text Occlusion & Staggering | Features 7-11 (UI-DEPTH-BAND, UI-DECLUTTER-MGR, UI-LOD-NAMETAG, UI-PLAYER-BUBBLE, UI-FLOAT-CASCADE) | M1 | DONE |
| M3 | Massive Juice & Animation Upgrade | Features 12-16 (JUICE-BOB-SQUASH, JUICE-BOMB-PULSE, JUICE-TRAUMA-FREEZE, JUICE-ZERO-GC-VFX, JUICE-DROP-SHADOW) | M1, M2 | DONE |
| M4 | Full Regression, Build & COLLABORATION Sync | Feature 17 (npm test, npm run lint, npm run build, COLLABORATION.md, PROJECT.md) | M1, M2, M3 | DONE |
