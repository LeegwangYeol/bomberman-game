## 2026-09-22T05:16:16Z
You are the Implementation and QA Worker for Milestone 2: Bomberman Visual & Functional Testing and Remediation.

Your working directory is: /Users/user/src/bomberman/.agents/worker_m2

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INPUTS:
- Read /Users/user/src/bomberman/ORIGINAL_REQUEST.md
- Read /Users/user/src/bomberman/COLLABORATION.md
- Read /Users/user/src/bomberman/.agents/explorer_m1/handoff.md
- Read /Users/user/src/bomberman/.agents/orchestrator_visual_test/SCOPE.md

YOUR TASKS:
1. Wire up Crisis Mode visual rendering and Situation Log HUD:
   - As identified by Explorer M1, the complete crisis subsystem exists in `src/game/crises/` (CrisisManager, SituationLog, VoidCrisis, etc.).
   - In `src/game/GameScene.ts`: Upon receiving `mode-changed` with `'crisis_survival'` or `'CRISIS_SURVIVAL'`, trigger a crisis (e.g., `CrisisType.PASTEL_VOID` or rotating crisis), update the crisis manager in `update(delta)`, and render the crisis hazard graphics (e.g. void rifts/prisms/danger areas using Phaser Graphics). Ensure `stopCrisis` is called when switching away from crisis mode.
   - In `src/components/BombermanGame.tsx`: Wire `SituationLog` event bridge (`'situation-log-update'`) and render a high-visibility Situation Log HUD overlay card during active crisis (displaying Crisis Name, Threat Level bar, Active Directives/Objectives, and Countdown).
   - Ensure `npm test`, `npm run lint`, and `npm run build` continue to pass cleanly without any regressions.

2. Browser Automation, Screenshot Captures, and Console Error Monitoring:
   - Ensure the game is running on `http://localhost:3000` (Next.js dev server is running as task-110, or verify with curl/browser).
   - Use browser automation (such as `chrome-devtools-mcp` tools or Puppeteer/headless script) to open the page.
   - Monitor the browser console for any errors or warnings throughout the entire run.
   - Navigate and capture at least 4 distinct, high-resolution screenshots saved to `/Users/user/src/bomberman/screenshots/`:
     a. `screenshots/menu.png`: Main menu / Arcade control center (Arcade Marquee header, mode selectors, meta-progression bar, controls guide).
     b. `screenshots/gameplay.png`: Standard gameplay with player sprite, moving enemies with overhead nametags and intent badges, destructible blocks, portals, and retro HUD.
     c. `screenshots/boss_fight.png`: Epic boss encounter (`Boss Rush Gauntlet` mode) showing King Gummy Bear on canvas with telegraph rings, and the React Boss HUD overlay mounted at the top (avatar, name, segmented HP bars, Berserk Rage gauge).
     d. `screenshots/crisis_event.png`: Map crisis event (`Crisis Survival` mode) showing environmental hazard graphics on canvas and the Situation Log HUD overlay card (threat meter, objectives).
   - Note: If using `take_screenshot` in `chrome-devtools-mcp`, remember the Explorer's tip: omit `filePath` parameter so it offloads the image to `.system_generated/steps/.../media_0.png`, then copy (`cp`) that file to `/Users/user/src/bomberman/screenshots/<name>.png`.

3. Autonomous Bug Catching & Remediation:
   - Inspect all captured screenshots for visual defects (clipping, missing textures, overlapping text).
   - Check all browser console messages for errors or unhandled exceptions.
   - If ANY bug, visual glitch, or console error is observed, write genuine fixes in the codebase and re-run the browser validation.
   - Verify 0 remaining console errors in the final validation run!

4. Document and Report:
   - Run `npm test`, `npm run lint`, and `npm run build`.
   - Write a detailed report to `/Users/user/src/bomberman/.agents/worker_m2/handoff.md` with:
     * Code changes made (GameScene.ts, BombermanGame.tsx, etc.)
     * Captured screenshot file paths, dimensions, and visual verification
     * Console messages log during all 4 stages (confirming 0 errors)
     * Test, lint, and build verification outputs
   - Send completion message to parent.
