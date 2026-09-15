# Dispatch: Worker Milestone 1 — Directional Animations & Spritesheet

## Mission
Implement fluid directional character animations (up, down, left, right), walk cycles, idle preservation, and defeat animation using a 120x160 spritesheet.

## References
- `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/.agents/explorer_mech_anim/handoff.md`

## Owned Files
- `scripts/generate-assets.sh`
- `public/assets/player.png`
- `src/game/GameScene.ts` (Animation registration, facing state, updatePlayerMovement, playerDie)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Requirements & Verification
1. Update `scripts/generate-assets.sh` with the 120x160 12-frame SVG spritesheet template from `explorer_mech_anim/handoff.md`.
2. Run `bash scripts/generate-assets.sh` and verify with `sips -g pixelWidth -g pixelHeight public/assets/player.png` (must be 120x160).
3. In `src/game/GameScene.ts`:
   - `this.load.spritesheet('player', '/assets/player.png', { frameWidth: 40, frameHeight: 40 });`
   - Create animations: `player_down` (frames 0, 1, 0, 2), `player_up` (3, 4, 3, 5), `player_side` (6, 7, 6, 8), `player_defeat` (9, 10, 11).
   - Track `playerFacing: 'down' | 'up' | 'left' | 'right' = 'down'`.
   - In `updatePlayerMovement()`:
     - On active movement, set `playerFacing` and play corresponding animation with `ignoreIfPlaying: true`.
     - When movement stops, call `this.player.anims.stop()` and set idle frame (0 for down, 3 for up, 6 with flipX for side).
     - Preserve `setFlipX(wantX < 0)` so existing corner rounding and corridor centering work seamlessly.
   - In `playerDie()`, play `player_defeat`.
4. Run `npm test` (all 70 tests must pass).
5. Run `npm run build` (must exit with code 0).
6. Write your handoff report to `/Users/user/src/bomberman/.agents/worker_mech_anim/handoff.md`.

## 2026-09-15T04:17:52Z
You are worker_mech_anim, a Worker subagent in the Bomberman project.
Your working directory is: /Users/user/src/bomberman/.agents/worker_mech_anim
Your assignment is Milestone 1: Directional character animations, spritesheet generation, GameScene animation registration, facing retention, and player_defeat hook.

