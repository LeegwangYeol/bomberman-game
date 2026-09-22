# Challenger 2 Task: Adversarial Suicide Prevention & Zero-GC Fuzzing

You are Challenger 2 for the Aggressive Enemy AI Rewrite milestone.

Working Directory: /Users/user/src/bomberman/.agents/challenger_aggressive_ai_2/
Project Root: /Users/user/src/bomberman
Authoritative Request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Worker Handoff: /Users/user/src/bomberman/.agents/worker_aggressive_ai/handoff.md
Scope: /Users/user/src/bomberman/.agents/orchestrator_aggressive_ai/SCOPE.md

## Mission:
Adversarially challenge the suicide-prevention invariant and Zero-GC guarantees:
1. Design and execute an adversarial stress test script (e.g., `tests/adversarial_suicide_zerogc.test.mjs`) focusing on:
   - 10,000 randomized dead-end, cul-de-sac, and narrow corridor configurations with active bombs.
   - Assert 0% false positives (zero suicides allowed under any geometry).
   - High-load soak test (10,000+ calls to `findPathWithDemolition`, `canSafelyPlaceBomb`, `findCorneringBombTile`) verifying heap stability and zero memory drift.
   - Boundary checks: edge of map, corner coordinates, power = 1..8, multi-bomb congestion.
2. Execute the test and verify passes.
3. Formulate an explicit verdict: `APPROVE` or `REQUEST_CHANGES`.

Write your full adversarial report to:
`/Users/user/src/bomberman/.agents/challenger_aggressive_ai_2/handoff.md`
Remember to send a message to orchestrator when finished.
