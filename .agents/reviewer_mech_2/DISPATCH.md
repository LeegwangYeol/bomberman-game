# Dispatch: Reviewer 2 (Robustness, Edge Cases & Physics Invariants)

## Mission
Perform adversarial code review of the newly implemented Bomberman expansion:
1. Corner-sliding physics compatibility and hitbox invariants (24x24 body at offset 8,8).
2. Enemy bomb placement suicide prevention (`findEscapePathBFS`, `getBlastTiles`, `EVADING` state, rate-limiting, and cul-de-sac refusal).
3. Item drops, 600ms grace period protection, stat mutation caps, bomb kick sliding physics, dash invulnerability frames, shield barrier absorption, conveyor drift, and teleport debounce.
4. React <-> Phaser event bridge lifecycle and state synchronization.

## Instructions
- Read `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`, `/Users/user/src/bomberman/COLLABORATION.md`, and `/Users/user/src/bomberman/PROJECT.md`.
- Inspect code and test suites. Run `npm test`, `npm run lint`, and `npm run build`.
- Review for race conditions, memory leaks, NaN or division-by-zero vectors, and physics bugs.
- Write your review with explicit verdict (APPROVE or REQUEST_CHANGES) to `/Users/user/src/bomberman/.agents/reviewer_mech_2/handoff.md`.

## 2026-09-15T04:39:30Z
Perform adversarial review focusing on:
1. Physics invariants, 24x24 hitbox offset preservation, and corner sliding.
2. Suicide prevention escape BFS, cul-de-sac refusal, and bomb count isolation.
3. Item drop rates, 600ms grace window, stat caps, bomb kick sliding, dash i-frames, and shield absorption.
4. React-Phaser event listener cleanup and memory management.

Run `npm test`, `npm run lint`, and `npm run build`.
Write a complete handoff report with explicit verdict (APPROVE or REQUEST_CHANGES) to `/Users/user/src/bomberman/.agents/reviewer_mech_2/handoff.md`.
When complete, send a message to parent notifying your verdict.
