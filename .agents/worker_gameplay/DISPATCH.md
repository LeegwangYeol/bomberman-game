# Dispatch: GameScene & Enemy Attack AI Implementation Worker (Milestone 2)

## 2026-09-14T10:34:47Z

## Mission
Implement real image asset loading in Phaser `preload()`, background rendering, and advanced Enemy Tracking & Attack AI in `src/game/GameScene.ts`.

## Authoritative Inputs
- ORIGINAL_REQUEST: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
- Collaboration Guide: /Users/user/src/bomberman/COLLABORATION.md
- Codebase Survey Report: /Users/user/src/bomberman/.agents/explorer_codebase/report.md
- Asset Strategy Report: /Users/user/src/bomberman/.agents/explorer_assets/report.md
- AI Architecture Report: /Users/user/src/bomberman/.agents/explorer_ai/report.md
- Project Scope: /Users/user/src/bomberman/.agents/orchestrator_impl/PROJECT.md

## Scope & Instructions
1. In `src/game/GameScene.ts`:
   - Replace procedural graphics in `preload()` with real image asset loading:
     `this.load.image('player', '/assets/player.png');`
     `this.load.image('enemy', '/assets/enemy.png');`
     `this.load.image('enemy_tracker', '/assets/enemy_tracker.png');`
     `this.load.image('bomb', '/assets/bomb.png');`
     `this.load.image('explosion', '/assets/explosion.png');`
     `this.load.image('wall', '/assets/wall.png');`
     `this.load.image('block', '/assets/block.png');`
     `this.load.image('floor', '/assets/floor.png');`
     `this.load.image('background', '/assets/background.png');`
   - In `create()`:
     * Add `background` image at (400, 300) with `setScrollFactor(0)` and `setDepth(-10)`.
     * Render floor tiles at depth 0.
     * Render walls and blocks at depth 1.
     * Spawn player with physics body size `28x28` (offset `6, 6`) at depth 10.
     * Spawn enemies (including advanced tracking enemies) with physics body size `28x28` (offset `6, 6`) at depth 9.
   - Implement the advanced Enemy Tracking & Attack AI (as designed in `explorer_ai/report.md`):
     * Discrete BFS grid pathfinding on the 13x15 arena avoiding walls and blocks with active bomb avoidance.
     * Nearest-frontier Manhattan fallback when player is enclosed by breakable blocks.
     * Tile-center waypoint snapping to prevent 1-tile corridor corner snagging.
     * 4-Stage Attack State Machine:
       - `TRACKING`: Pursues player along BFS path at 75 px/s.
       - `WINDUP`: Telegraphs attack with red alert tint for 450ms when in line of sight or range.
       - `ATTACK`: Executes high-speed charge dash at 200 px/s along corridor.
       - `COOLDOWN`: Recovers for 1200ms with blue tint, allowing tactical counterplay.
   - Fix all TypeScript `any` types in `src/game/GameScene.ts`.
2. Run `npm run build` to verify clean compilation with exit code 0.
3. Write your report and 5-component handoff in `/Users/user/src/bomberman/.agents/worker_gameplay/handoff.md`.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
