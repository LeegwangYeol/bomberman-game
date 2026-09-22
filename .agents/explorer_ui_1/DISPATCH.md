# Task Assignment: Explorer 2 (UI Depth & Text Occlusion)

## Context
Read `/Users/user/src/bomberman/ORIGINAL_REQUEST.md` and `/Users/user/src/bomberman/COLLABORATION.md`.

## Mission
Investigate the UI floating text, name tags, health bars, and visual indicators:
1. Examine where floating text and name tags are created and updated in `GameScene.ts`, `src/game/entities/`, and any UI overlays.
2. Investigate why name tags overlap with characters or with other floating text when entities cluster.
3. Inspect depth / z-indexing of all entities, text objects, and HUD elements.
4. Formulate architectural solutions for:
   - Dynamic collision avoidance/repositioning of floating name tags.
   - Proximity-based opacity fading or decluttering when multiple entities/name tags are near each other.
   - Guaranteed entity visibility (preventing text from obscuring the character sprite).
   - Proper depth/sorting so gameplay entities and their labels render cleanly.
5. Write your complete analysis and recommendations to `.agents/explorer_ui_1/handoff.md`.

## 2026-09-22T07:57:11Z
You are Explorer 2. Your working directory is /Users/user/src/bomberman/.agents/explorer_ui_1.
Read /Users/user/src/bomberman/ORIGINAL_REQUEST.md, /Users/user/src/bomberman/COLLABORATION.md, and /Users/user/src/bomberman/.agents/explorer_ui_1/DISPATCH.md.
Investigate the UI floating text, name tags, health bars, and visual indicators.
Identify why name tags overlap with characters or with other floating text when entities cluster.
Inspect depth / z-indexing of all entities, text objects, and HUD elements.
Formulate architectural solutions for dynamic collision avoidance, repositioning, proximity opacity fading, and z-index ordering.
Write your findings and recommendations to /Users/user/src/bomberman/.agents/explorer_ui_1/handoff.md.
When finished, send a message to parent with a summary and the handoff path.
