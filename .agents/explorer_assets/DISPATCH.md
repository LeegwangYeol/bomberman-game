# Dispatch: Asset Strategy Explorer

## Mission
Survey the asset pipeline and design strategy for real image assets (.png) and backgrounds for the classic/cute Bomberman prototype.

## Authoritative Inputs
- ORIGINAL_REQUEST: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
- Collaboration Guide: /Users/user/src/bomberman/COLLABORATION.md

## Scope & Instructions
1. Inspect `public/` directory and see what assets currently exist.
2. Determine the exact set of image assets required:
   - Player sprite
   - Enemy sprites (normal enemy, tracking enemy)
   - Bomb sprite & Explosion sprites
   - Unbreakable wall tile, Destructible block tile
   - Background / floor tile
3. Investigate how Phaser `preload()` loads images (e.g. `this.load.image(...)` or `this.load.spritesheet(...)`) and how sprites are created in `GameScene.ts`.
4. Formulate the technical specification for sprite dimensions, formats, and generation methods (e.g. clean canvas/sharp or script-based generation of high-quality retro pixel sprites, or SVG-to-PNG / canvas-to-PNG generation).
5. Write your comprehensive exploration report to `/Users/user/src/bomberman/.agents/explorer_assets/report.md` and handoff to `/Users/user/src/bomberman/.agents/explorer_assets/handoff.md`.

## 2026-09-14T10:29:51Z
You are the Asset Strategy Explorer for the Bomberman prototype implementation.
Working directory: /Users/user/src/bomberman/.agents/explorer_assets
Identity & Dispatch instructions: /Users/user/src/bomberman/.agents/explorer_assets/DISPATCH.md
Authoritative request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Collaboration guide: /Users/user/src/bomberman/COLLABORATION.md

Investigate:
1. Inspect `public/` directory and existing assets.
2. Enumerate all required .png image assets (player, enemies, bombs, explosion, wall, block, floor/background).
3. Determine how Phaser `preload()` will load images and how `GameScene.ts` will render them.
4. Recommend the exact asset pipeline and file specifications.
5. Write your detailed exploration report to `/Users/user/src/bomberman/.agents/explorer_assets/report.md` and your handoff to `/Users/user/src/bomberman/.agents/explorer_assets/handoff.md`.
Communicate your completion back to the orchestrator via send_message.

