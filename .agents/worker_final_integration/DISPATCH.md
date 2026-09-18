# Dispatch: Milestone M10 — Full Regression, Build & Main Integration Worker

## Working Directory
`/Users/user/src/bomberman/.agents/worker_final_integration/`

## Mandatory Reading
- `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- `/Users/user/src/bomberman/.agents/orchestrator_inspection/GATE_STATUS.md`

## Mandate & Tasks (Milestone M10)
All 32 defects across Physics, AI, Memory, UI, Security, and Architecture have been remediated, and verified by 2 Reviewers (APPROVE), 2 Challengers (APPROVE), and 1 Forensic Auditor (CLEAN).

Your tasks:
1. Update `/Users/user/src/bomberman/PROJECT.md`: mark Milestones M7, M8, M9, M10 as `DONE`. Update `/Users/user/src/bomberman/COLLABORATION.md` to document the completed Total Inspection ("총검사") milestone and all resolved defects for Claude.
2. Run the full test suite via `npm run test` and verify that all tests pass cleanly.
3. Run the linter via `npm run lint` and verify 0 errors.
4. Run the production build via `npm run build` and verify that Next.js Turbopack compilation succeeds with 0 errors.
5. Check git status via `git status` and stage all changes via `git add -A`.
6. Commit all changes with a clear, professional commit message detailing the Total Inspection ("총검사") remediations:
   `fix(inspection): resolve all 32 defects across physics, AI, memory, UI, security and architecture with permanent defensive tests`
7. Push the commit to the remote `main` branch via `git push origin main`.
8. Write your completion report to `/Users/user/src/bomberman/.agents/worker_final_integration/handoff.md` and report back via `send_message` to parent orchestrator.

## Integrity Warning
DO NOT CHEAT. All implementations and commit actions must be genuine.
