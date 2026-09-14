# Dispatch: Asset Generation Worker (Milestone 1)

## Mission
Generate all 9 real image assets (.png) for the classic/cute Bomberman game and place them into `/Users/user/src/bomberman/public/assets/`.

## Authoritative Inputs
- ORIGINAL_REQUEST: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
- Collaboration Guide: /Users/user/src/bomberman/COLLABORATION.md
- Asset Strategy Report: /Users/user/src/bomberman/.agents/explorer_assets/report.md
- Project Specification: /Users/user/src/bomberman/.agents/orchestrator_impl/PROJECT.md

## Scope & Instructions
1. Read `/Users/user/src/bomberman/.agents/explorer_assets/report.md` for the complete vector SVG designs, color palettes, and `sips` rasterization commands.
2. Create the directory `/Users/user/src/bomberman/public/assets/`.
3. Generate all 9 32-bit RGBA PNG assets:
   - `player.png` (40x40 px) - Cute Bomberman hero with white helmet, blue suit, pink face/cheeks, pom-pom antenna.
   - `enemy.png` (40x40 px) - Cute balloon/blob enemy with red eyes and toothy grin.
   - `enemy_tracker.png` (40x40 px) - Advanced tracking enemy (armored/horned demon/droid with menacing eye).
   - `bomb.png` (40x40 px) - Classic round black bomb with burning fuse spark.
   - `explosion.png` (40x40 px) - Fiery comic explosion burst with inner yellow core and outer orange flare.
   - `wall.png` (40x40 px) - Hard indestructible steel/stone patterned block.
   - `block.png` (40x40 px) - Destructible brick block with cracks and depth shading.
   - `floor.png` (40x40 px) - Clean checkered retro grid floor tile.
   - `background.png` (800x600 px) - High-quality retro arena backdrop framing the playfield.
4. Verify every image using `sips -g pixelWidth -g pixelHeight public/assets/*.png` and ensure all files exist and have non-zero size.
5. Provide your detailed report and 5-component handoff in `/Users/user/src/bomberman/.agents/worker_assets/handoff.md`.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-09-14T10:33:01Z
You are the Asset Generation Worker (Milestone 1) for the Bomberman prototype implementation.
Working directory: /Users/user/src/bomberman/.agents/worker_assets
Identity & Dispatch instructions: /Users/user/src/bomberman/.agents/worker_assets/DISPATCH.md
Authoritative request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Collaboration guide: /Users/user/src/bomberman/COLLABORATION.md
Asset Strategy Report: /Users/user/src/bomberman/.agents/explorer_assets/report.md

Task:
1. Generate all 9 high-quality 32-bit RGBA PNG assets in `/Users/user/src/bomberman/public/assets/`:
   - `player.png`, `enemy.png`, `enemy_tracker.png`, `bomb.png`, `explosion.png`, `wall.png`, `block.png`, `floor.png` (40x40 px)
   - `background.png` (800x600 px)
2. Use macOS `sips` to cleanly rasterize the vector assets as detailed in `explorer_assets/report.md`.
3. Verify all assets exist with non-zero bytes and exact pixel dimensions.
4. Write your detailed report and handoff in `/Users/user/src/bomberman/.agents/worker_assets/handoff.md`.

