## 2026-09-15T07:49:28Z

You are the E2E Test Suite Designer & Writer for the Bomberman Massive Scale Expansion.
Working directory: /Users/user/src/bomberman/.agents/test_writer_expansion_e2e/
Authoritative request path: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md (specifically '## Follow-up — 2026-09-15T07:08:09Z'). Read it before doing anything!
Also read /Users/user/src/bomberman/COLLABORATION.md and /Users/user/src/bomberman/PROJECT.md.
Read survey handoff reports:
- `/Users/user/src/bomberman/.agents/explorer_expansion_items/handoff.md`
- `/Users/user/src/bomberman/.agents/explorer_expansion_entities/handoff.md`
- `/Users/user/src/bomberman/.agents/explorer_expansion_skills/handoff.md`

Exclusive Write Ownership:
- `TEST_INFRA.md` at project root
- `TEST_READY.md` at project root
- `tests/items_expansion.test.mjs`
- `tests/entities_expansion.test.mjs`
- `tests/ultimate_skills.test.mjs`
- `tests/hud_inventory_expansion.test.mjs`
Do NOT modify production source files in `src/`.

Your Mission:
1. Design comprehensive test architecture adhering to the 4-tier methodology:
   - Tier 1: Feature Coverage (>=5 test cases per feature covering all 24 items, 5 enemy types, 2 neutrals, 3 allies, 5 ultimate skills).
   - Tier 2: Boundary & Corner Cases (stat caps, 600ms grace window, dead-drop redirection, suicide prevention, cooldown lockouts).
   - Tier 3: Cross-Feature Combinations (pairwise interactions like Ice Bomb vs Ghost, Tank destroying soft block with Item, Mini-Bomber buddy assisting during Time Stop).
   - Tier 4: Real-World Application Scenarios (full game simulation loops, multi-wave entity encounters).
2. Author `TEST_INFRA.md` at project root summarizing test methodology, feature coverage matrix, and test runner instructions.
3. Write clean, robust Node.js test files in `tests/`:
   - `tests/items_expansion.test.mjs` (24 items definition, drop rates, cap redirection, grace period, effect logic)
   - `tests/entities_expansion.test.mjs` (5 enemy archetypes, neutral NPCs, AI allies, health pools, 3-tier UI data structure)
   - `tests/ultimate_skills.test.mjs` (5 ultimate skills, 100-pt charging economy, lockout window, camera trauma decay formula)
   - `tests/hud_inventory_expansion.test.mjs` (inventory tracking, bridge event serialization, mobile drawer state)
4. Execute `npm test` to verify all new and existing tests execute and pass cleanly.
5. Create `TEST_READY.md` at project root once test suites are verified and ready.
6. Author a handoff report at `/Users/user/src/bomberman/.agents/test_writer_expansion_e2e/handoff.md` and communicate completion back via send_message.
