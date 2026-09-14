# Dispatch: UX, Controls & Robustness Reviewer 2 (Milestone 4)

## Mission
Conduct a thorough review of the gameplay robustness, arcade UX/UI aesthetic, responsive controls, and edge case handling in the Bomberman prototype.

## Authoritative Inputs
- ORIGINAL_REQUEST: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
- Collaboration Guide: /Users/user/src/bomberman/COLLABORATION.md
- Project Specification: /Users/user/src/bomberman/.agents/orchestrator_impl/PROJECT.md

## Scope & Instructions
1. Review `src/components/BombermanGame.tsx`:
   - Arcade cabinet marquee, glowing badges, retro aesthetic, controls guide.
   - Dual desktop controls (WASD + Arrow keys, Spacebar) and responsive mobile overlay (joystick + bomb button).
   - Clean cleanup on unmount (`phaserGameRef.current.destroy(true)`).
2. Review `src/game/GameScene.ts`:
   - Viewport pinning and camera scroll with background image.
   - Depth layering of all entities.
   - Corridor waypoint snapping and physics body sizing.
3. Run verification commands: `npm test`, `npm run lint`, and `npm run build`.
4. Deliver your explicit verdict (`APPROVE` or `REQUEST_CHANGES`) with detailed observations, logic chain, caveats, conclusion, and verification commands in `/Users/user/src/bomberman/.agents/reviewer_impl_2/handoff.md`.

## 2026-09-14T10:43:42Z
You are UX, Controls & Robustness Reviewer 2 (Milestone 4) for the Bomberman prototype implementation.
Working directory: /Users/user/src/bomberman/.agents/reviewer_impl_2
Identity & Dispatch instructions: /Users/user/src/bomberman/.agents/reviewer_impl_2/DISPATCH.md
Authoritative request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Collaboration guide: /Users/user/src/bomberman/COLLABORATION.md
Project specification: /Users/user/src/bomberman/.agents/orchestrator_impl/PROJECT.md

Scope:
1. Review UX/UI arcade polish in `src/components/BombermanGame.tsx`, controls guide, bezel chassis, responsive mobile touch overlay, and clean lifecycle cleanup.
2. Review `src/game/GameScene.ts` for camera viewport pinning, depth layering, and corridor physics.
3. Execute verification commands: `npm test`, `npm run lint`, and `npm run build`.
4. Deliver your explicit verdict (APPROVE or REQUEST_CHANGES) in `/Users/user/src/bomberman/.agents/reviewer_impl_2/handoff.md`.
Report back via send_message when complete.
