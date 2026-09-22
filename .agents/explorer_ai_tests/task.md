# Explorer Task: Test Infrastructure & Aggressive AI Test Design

You are Explorer 3 for the Aggressive Enemy AI Rewrite milestone.

Working Directory: /Users/user/src/bomberman/.agents/explorer_ai_tests/
Authoritative Request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Orchestrator Plan: /Users/user/src/bomberman/.agents/orchestrator_aggressive_ai/plan.md

## Mission:
Investigate existing test architecture and requirements for `tests/aggressive_ai.test.mjs`:
1. Inspect existing tests in `tests/` (e.g., `tests/enemy_ai.test.mjs`, `tests/mechanics_expansion.test.mjs`, `tests/zero_gc_soak.test.mjs`, etc.) to understand how scenes, tilemaps, enemies, bombs, and players are instantiated and stepped in Node.js test runs.
2. Check how block destruction and bomb detonations are simulated in tests (e.g. tile updates, callbacks, timer advancing).
3. Design the test scenarios for `tests/aggressive_ai.test.mjs`:
   - Scenario A: Block Demolition / Territory Expansion: An enemy is trapped or blocked from the player by destructible soft blocks. Prove that the enemy actively moves towards a blocking soft block, drops a bomb, evades the blast safely, and after the block is destroyed, navigates through the newly opened corridor towards the player.
   - Scenario B: Relentless Hunting & Distance Reduction: Compare standard/old random movement vs aggressive AI. Prove that over N ticks/frames, the enemy consistently reduces distance to the player across varied grid layouts.
   - Scenario C: Cornering & Trap Bombing: When the player is in a corridor or corner, prove that the enemy positions or drops a bomb to cut off escape without killing itself.
   - Scenario D: Suicide Prevention Invariant: Even in aggressive mode, enemies never drop bombs in dead ends where no escape path exists.
4. Document exact test structure, assertions, and mock helpers needed.

Output your report to:
`/Users/user/src/bomberman/.agents/explorer_ai_tests/handoff.md`
Remember to send a message to orchestrator when finished.
