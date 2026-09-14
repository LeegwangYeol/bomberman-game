# Dispatch: UI & Component Polish Worker (Milestone 3)

## Mission
Polish the UI container, retro aesthetic, and TypeScript typings in `src/components/BombermanGame.tsx`.

## Authoritative Inputs
- ORIGINAL_REQUEST: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
- Collaboration Guide: /Users/user/src/bomberman/COLLABORATION.md
- Codebase Survey Report: /Users/user/src/bomberman/.agents/explorer_codebase/report.md
- Project Scope: /Users/user/src/bomberman/.agents/orchestrator_impl/PROJECT.md

## Scope & Instructions
1. Inspect `src/components/BombermanGame.tsx`.
2. Fix all TypeScript `any` types on NippleJS event listeners (e.g. line 84, 92) by defining clean TypeScript types/interfaces.
3. Enhance the game wrapper UI:
   - Add cute retro arcade styling, responsive layout (mobile joystick area + bomb button + desktop key guide).
   - Ensure the canvas container is neatly framed and centered.
4. Verify `npm run build` succeeds cleanly with exit code 0.
5. Write your detailed report and 5-component handoff in `/Users/user/src/bomberman/.agents/worker_ui/handoff.md`.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-09-14T10:39:52Z
You are the UI & Component Polish Worker (Milestone 3) for the Bomberman prototype implementation.
Working directory: /Users/user/src/bomberman/.agents/worker_ui
Identity & Dispatch instructions: /Users/user/src/bomberman/.agents/worker_ui/DISPATCH.md
Authoritative request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Collaboration guide: /Users/user/src/bomberman/COLLABORATION.md
Target file: `src/components/BombermanGame.tsx`

Task:
1. Polish `src/components/BombermanGame.tsx` to make the UI look and feel like a high-quality, classic Bomberman arcade game (R1 requirement: "Make the UI look and feel like a high-quality, classic Bomberman game"):
   - Add a sleek retro arcade cabinet header / title bar with cute badge, title, and key controls guide (Desktop: [Arrow Keys / WASD] Move, [Spacebar] Plant Bomb).
   - Ensure the canvas container is neatly framed with a retro bezel / subtle neon glow.
   - Maintain mobile touch controls (virtual joystick + bomb button) with responsive layout.
2. Ensure strict TypeScript types (no `any`).
3. Run `npm run lint` and `npm run build` to verify clean compilation with exit code 0.
4. Write your report and 5-component handoff in `/Users/user/src/bomberman/.agents/worker_ui/handoff.md`.
