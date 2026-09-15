# BRIEFING — 2026-09-15T20:40:00+09:00

## Mission
Implement Ultimate Skills & High-Impact VFX (M3) including registry, CameraTrauma, WebAudioSynth, VFX helpers, GameScene integration, and BombermanGame HUD & touch controls.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa
- Working directory: /Users/user/src/bomberman/.agents/worker_expansion_m3_skills
- Original parent: f6499d96-d3dc-44ee-b2ee-9207d8389e79
- Milestone: M3 Ultimate Skills & High-Impact VFX

## 🔒 Key Constraints
- DO NOT CHEAT: Genuine implementation, no hardcoded test results, no dummy facades.
- All 5 ultimate skills: METEOR_STRIKE, SUPER_NOVA, CHRONO_FREEZE, NUCLEAR_BARRAGE, AEGIS_OVERDRIVE.
- CameraTrauma: square-law decay model, trauma in [0.0, 1.0], decay rate 1.4, maxOffset 18px, maxAngle 3.5 deg.
- Zero-dependency procedural Web Audio synthesis engine (WebAudioSynth).
- Pass all tests: `node --test tests/ultimate_skills.test.mjs`, `node --test tests/hud_inventory_expansion.test.mjs`, `npm test` (all 241+ tests), `npm run lint`, `npm run build`.

## Current Parent
- Conversation ID: f6499d96-d3dc-44ee-b2ee-9207d8389e79
- Updated: 2026-09-15T20:40:00+09:00

## Task Summary
- **What to build**: `src/game/ultimate_skills.ts`, integration into `src/game/GameScene.ts`, integration into `src/components/BombermanGame.tsx`.
- **Success criteria**: 16/16 ultimate skills tests, 11/11 hud tests, 0 lint errors, Next.js build clean, all tests pass.
- **Interface contracts**: tests/ultimate_skills.test.mjs, tests/hud_inventory_expansion.test.mjs
- **Code layout**: src/game, src/components

## Change Tracker
- **Files modified**:
  - `src/game/ultimate_skills.ts`: Full production implementation of 5 ultimate skills, Square-Law CameraTrauma decay, 100-pt / 6000ms lockout UltimateEngine, WebAudioSynth procedural synthesis, and procedural VFX helpers.
  - `src/game/gameplay_mechanics.ts`: Added `ultimateLockoutRemaining` to `PlayerStats` and initial state.
  - `src/game/GameScene.ts`: Wired charge sources (+2 block, +15 enemy, +25 elite, +1/3s survival), 6000ms lockout, camera trauma per-frame shake, R/Q keys & mobile trigger, and 5 tactical ultimate execution methods.
  - `src/components/BombermanGame.tsx`: Added `ultimate: boolean` to mobileInput, desktop hotkey listeners for R & Q, golden crown 64px `[ULT]` touch control with ready pulsing glow, and golden ultimate energy gauge bar in arcade HUD.
  - `tests/ultimate_skills.test.mjs`: Linked to export from `src/game/ultimate_skills.ts`.
- **Build status**: PASS (Next.js 16.3.5 Turbopack exit code 0)
- **Pending issues**: None

## Quality Status
- **Build/test result**: PASS (node tests 16/16, hud tests 11/11, npm test 241/241 pass)
- **Lint status**: PASS (0 errors, 26 harmless warnings in unrelated tests)
- **Tests added/modified**: tests/ultimate_skills.test.mjs re-exports and verifies `src/game/ultimate_skills.ts`

## Key Decisions Made
- Used `import type Phaser from 'phaser'` to ensure 100% compatibility with Node `--experimental-strip-types` unit test runner and Next.js Turbopack build.
- Implemented square-law trauma decay with trauma exponentiation `trauma^2 * maxOffset` for physical camera kick.
- Designed zero-dependency `WebAudioSynth` with Web Audio API AudioContext, oscillators, bandpass filters, gain envelopes, and white-noise buffers.

## Artifact Index
- DISPATCH.md — Dispatch instructions and heartbeat updates
- BRIEFING.md — Context and identity tracking
- progress.md — Real-time progress and heartbeat
- handoff.md — 5-component completion report
