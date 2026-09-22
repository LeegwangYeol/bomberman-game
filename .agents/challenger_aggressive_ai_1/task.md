# Challenger 1 Task: Adversarial Demolition & Hunting Stress Testing

You are Challenger 1 for the Aggressive Enemy AI Rewrite milestone.

Working Directory: /Users/user/src/bomberman/.agents/challenger_aggressive_ai_1/
Project Root: /Users/user/src/bomberman
Authoritative Request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Worker Handoff: /Users/user/src/bomberman/.agents/worker_aggressive_ai/handoff.md
Scope: /Users/user/src/bomberman/.agents/orchestrator_aggressive_ai/SCOPE.md

## Mission:
Adversarially challenge and stress-test the new aggressive AI algorithms:
1. Design and execute an adversarial stress test script (e.g., `tests/adversarial_demolition_hunting.test.mjs`) focusing on:
   - Maze-like grids completely partitioned by blocks with varying density (10% to 90% soft blocks).
   - High-speed dynamic players trying to evade cornering.
   - Long-distance pathfinding across maximum grid dimensions.
   - Rejection of invalid paths (e.g. completely solid indestructible wall enclosures).
   - Verifying that enemies consistently demolish blocks to open paths and reach the target.
2. Execute the test and verify passes.
3. Formulate an explicit verdict: `APPROVE` or `REQUEST_CHANGES`.

Write your full adversarial report to:
`/Users/user/src/bomberman/.agents/challenger_aggressive_ai_1/handoff.md`
Remember to send a message to orchestrator when finished.
