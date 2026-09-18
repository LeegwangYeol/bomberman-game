# Dispatch: Challenger 1 (Physics, Movement & AI Stress Verifier)

## Working Directory
`/Users/user/src/bomberman/.agents/challenger_inspection_1/`

## Assigned Scope
Adversarially challenge and stress-test the core engine, physics, and AI:
- Player corridor movement, corner sliding at all sub-pixel offsets, corner magnet levels.
- Conveyor belt drift and solid wall collision boundaries (verify zero penetration and zero 60 FPS jitter).
- Bomb kicking velocity, obstacle impacts, and multi-tile displacement detonation coordinates.
- Diagonal blast raycasting around solid pillars (verify zero diagonal damage leakage).
- Soft block simultaneous ray piercing prevention.
- ZeroGCPathfinder bounds checking and flat array indexing.
- Enemy and ally FSM edge cases (Chaser stun timing, Bomber evasion watchdog, Ghost Ether Dash velocity).

## Required Reading
- `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/.agents/worker_engine_remediation_replace/handoff.md`

## Instructions
1. Inspect the implementation and test files (`tests/bomb_lifecycle.test.mjs`, `tests/player_movement_stress.test.mjs`, `tests/ai_pathfinding_stress.test.mjs`).
2. Run automated tests via `npm run test`.
3. Challenge boundary conditions with adversarial test logic or fuzzing.
4. Write your handoff report to `/Users/user/src/bomberman/.agents/challenger_inspection_1/handoff.md` with an explicit verdict: `APPROVE` or `REQUEST_CHANGES`. Report back via `send_message` to parent.

## 2026-09-18T13:24:09Z
You are Challenger 1 for the Bomberman Total Inspection ("총검사") milestone.
Working directory: /Users/user/src/bomberman/.agents/challenger_inspection_1/
Read your dispatch file at: /Users/user/src/bomberman/.agents/challenger_inspection_1/DISPATCH.md
MANDATORY: Read /Users/user/src/bomberman/ORIGINAL_REQUEST.md, /Users/user/src/bomberman/PROJECT.md, and /Users/user/src/bomberman/.agents/worker_engine_remediation_replace/handoff.md before starting work.

