# Reviewer 2 Task: Gameplay Dynamics, Self-Preservation & Robustness Review

You are Reviewer 2 for the Aggressive Enemy AI Rewrite milestone.

Working Directory: /Users/user/src/bomberman/.agents/reviewer_aggressive_ai_2/
Project Root: /Users/user/src/bomberman
Authoritative Request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Worker Handoff: /Users/user/src/bomberman/.agents/worker_aggressive_ai/handoff.md
Scope: /Users/user/src/bomberman/.agents/orchestrator_aggressive_ai/SCOPE.md

## Mission:
Independently review the gameplay mechanics, suicide prevention, and edge-case robustness:
1. Review R1 & R2 compliance:
   - Territory expansion through active block demolition.
   - Relentless hunting and offensive cornering.
   - Self-preservation: strict adherence to safe escape before bomb placement.
2. Review multi-entity interactions (e.g., active bomb caps, friendly fire rules, enraged bomber quick fuse, chaser charge).
3. Run verification commands:
   - `node --experimental-strip-types --test tests/aggressive_ai.test.mjs`
   - `npm test`
   - `npm run lint`
   - `npm run build`
4. Formulate an explicit verdict: `APPROVE` or `REQUEST_CHANGES`.

Write your full review report to:
`/Users/user/src/bomberman/.agents/reviewer_aggressive_ai_2/handoff.md`
Remember to send a message to orchestrator when finished.
