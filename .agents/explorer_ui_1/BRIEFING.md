# BRIEFING — 2026-09-22T08:01:00Z

## Mission
Investigate UI floating text, name tags, health bars, and visual indicators, diagnosing overlap/occlusion and designing architectural solutions for depth sorting, collision avoidance, and proximity fading.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /Users/user/src/bomberman/.agents/explorer_ui_1
- Original parent: 16df783e-b15f-427a-b28b-1561d00db004
- Milestone: UI Depth, Text Occlusion & Floating Labels

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Depth / Z-indexing inspection of all entities, text objects, and HUD elements
- Dynamic collision avoidance, repositioning, proximity opacity fading, and z-index ordering
- Write 5-component handoff report to /Users/user/src/bomberman/.agents/explorer_ui_1/handoff.md
- Send message to parent upon completion

## Current Parent
- Conversation ID: 16df783e-b15f-427a-b28b-1561d00db004
- Updated: 2026-09-22T08:01:00Z

## Investigation State
- **Explored paths**:
  - `src/game/GameScene.ts` (entity management, depth assignments, update loops, floating text)
  - `src/game/entities/OverheadUI.ts` (3-tier overhead UI, exact offsets, depth 16/17, text styling)
  - `src/game/entities/BaseEntity.ts` (base entity depth 9, sprite dimensions 40x40, updateEntity)
  - `src/game/entities/types.ts` (archetype names, widths vs 40px grid tiles)
  - `src/game/bosses/BossHUD.ts` & `BaseBoss.ts` (boss depth 15, HUD bridging to React)
  - `src/components/BombermanGame.tsx` (React DOM HUD layers, z-20 to z-50)
  - `tests/entities_expansion.test.mjs` & `tests/entities_adversarial_stress.test.mjs` (test invariants on `getRenderLayers()`)
- **Key findings**:
  1. All entities have static depth 9, player has static depth 10, overhead UI has static depths 16 & 17, and floating text has static depth 20.
  2. Because depth is flat and static, Phaser sorts by display list addition order rather than vertical position (Y-sorting).
  3. When an entity is south of another entity or the player, its overhead labels (depth 16/17) render directly over the northern sprite (depth 9/10), occluding character bodies.
  4. Name tags are 100-120px wide (almost 3 tiles wide in a 40px grid), causing massive overlap when entities cluster.
  5. Floating text popups lack vertical stacking separation or cooldown queues, causing overlapping blobs on multiple pickups.
- **Unexplored areas**: None for UI depth and text occlusion. Ready for implementation by worker agent.

## Key Decisions Made
- Formulated 4-part architectural solution:
  1. Continuous Y-Sorted Depth Band (`RENDER_DEPTH`) from 100 to 700 with micro-offsets for shadows, sprites, and UI.
  2. Scene-Level `OverheadUIManager` with AABB collision detection, horizontal spring repulsion, and vertical under-foot staggering.
  3. Adaptive Name Tag LOD (Solo full name -> Clustered compact nickname -> Crowded minimal HP/intent only).
  4. Circular Player Sprite Protection Bubble ($R=38\text{px}$) with proximity-based opacity decay ($\alpha \to 0.15$).
  5. Staggered Floating Text Queue cascading popups vertically by 16px.

## Artifact Index
- /Users/user/src/bomberman/.agents/explorer_ui_1/DISPATCH.md — Assignment instructions
- /Users/user/src/bomberman/.agents/explorer_ui_1/BRIEFING.md — Situational awareness
- /Users/user/src/bomberman/.agents/explorer_ui_1/progress.md — Progress heartbeat
- /Users/user/src/bomberman/.agents/explorer_ui_1/handoff.md — Final 5-component handoff report
