# BRIEFING — 2026-09-15T04:22:00Z

## Mission
Implement Milestone 1: Directional character animations, spritesheet generation (120x160 12-frame SVG), Phaser animation registration in GameScene.ts, facing retention, and player_defeat hook. (COMPLETED)

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /Users/user/src/bomberman/.agents/worker_mech_anim
- Original parent: 44588999-8c10-421d-bf21-ce8f01b21f6e
- Milestone: Milestone 1 (Directional Animations & Spritesheet)

## 🔒 Key Constraints
- Integrity Mandate: DO NOT CHEAT. All implementations must be genuine. No hardcoding or facade implementations.
- Maintain physics body invariant: 24x24 hitbox with offset (8, 8) centered within 40x40 frame.
- Keep flipX contract compliant with existing 32 player_movement_stress tests.
- Zero regression on existing 70 tests.
- Clean build: npm run build exits with 0.

## Current Parent
- Conversation ID: 44588999-8c10-421d-bf21-ce8f01b21f6e
- Updated: 2026-09-15T04:22:00Z

## Task Summary
- **What to build**: 
  1. 120x160 SVG spritesheet in scripts/generate-assets.sh and render to public/assets/player.png.
  2. Spritesheet loading and animation registration in GameScene.ts (player_down, player_up, player_side, player_defeat).
  3. Directional movement handling with ignoreIfPlaying: true and idle frame retention based on playerFacing.
  4. Defeat animation in playerDie().
- **Success criteria**:
  - sips confirms public/assets/player.png is 120x160.
  - npm test passes all 77 tests (70 existing + 7 new).
  - npm run build succeeds with code 0.
- **Interface contracts**: PROJECT.md & explorer_mech_anim/handoff.md
- **Code layout**: PROJECT.md § Code Layout

## Key Decisions Made
- Used 120x160 spritesheet (3 cols x 4 rows) for down, up, side walk cycles and defeat.
- Left direction uses player_side with setFlipX(true) to preserve physics test expectations.
- Maintained playerFacing state ('down' | 'up' | 'left' | 'right') to preserve idle pose on movement stop.
- In playerDie(), replaced static black tint with player_defeat animation and reset playerFacing to 'down' on restart.
- Added tests/directional_animations.test.mjs with 7 behavioral and structural tests.

## Artifact Index
- /Users/user/src/bomberman/.agents/worker_mech_anim/DISPATCH.md — Assignment and instructions
- /Users/user/src/bomberman/.agents/worker_mech_anim/BRIEFING.md — Persistent working memory
- /Users/user/src/bomberman/.agents/worker_mech_anim/progress.md — Liveness heartbeat
- /Users/user/src/bomberman/.agents/worker_mech_anim/handoff.md — Final handoff report
- /Users/user/src/bomberman/tests/directional_animations.test.mjs — Milestone 1 test suite

## Change Tracker
- **Files modified**:
  - `scripts/generate-assets.sh`: Replaced single-frame player SVG with 12-frame 120x160 spritesheet SVG and updated sips conversion flag to `-z 160 120`.
  - `public/assets/player.png`: Re-generated 120x160 spritesheet PNG via sips.
  - `src/game/GameScene.ts`: Added playerFacing state, converted player loader to spritesheet (40x40), created 4 animations, implemented directional walk cycle playing and idle frame retention in updatePlayerMovement(), and hooked player_defeat animation into playerDie().
  - `tests/directional_animations.test.mjs`: Added 7 comprehensive behavioral and binary header verification tests.
- **Build status**: PASS (npm test 77/77 pass, npm run build exit code 0)
- **Pending issues**: none

## Quality Status
- **Build/test result**: PASS (77/77 passed, 0 failures, Next.js Turbopack build exit code 0)
- **Lint status**: PASS (eslint 0 violations)
- **Tests added/modified**: `tests/directional_animations.test.mjs` (7 new tests covering PNG IHDR dimensions, directional animation controllers, idle preservation, defeat trigger, and hitbox centering)

## Loaded Skills
- None explicitly assigned
