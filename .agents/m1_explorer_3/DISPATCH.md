# M1 Explorer 3: 10,000-Frame Headless Soak Test Harness Design

## Mission
You are M1 Explorer 3 working in `/Users/user/src/bomberman/.agents/m1_explorer_3/`.
You MUST read:
- `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/TEST_INFRA.md`
- Existing test suites in `tests/` (`tests/entity_lifecycle.test.mjs`, `tests/empirical_challenge_stress.test.mjs`)

## Objective
Design:
1. `tests/soak_10k_frames.test.mjs`: Complete headless 10,000-frame continuous simulation harness.
2. Simulates game loops, enemy pathfinding calls, bomb placements, detonations, particle lifecycles, and camera trauma updates across 10,000 continuous frames.
3. Heap measurement strategy: Warmup 1,000 frames -> baseline heap measurement via `process.memoryUsage().heapUsed` -> run 9,000 frames -> post-run heap check -> assert `heapGrowth <= 0.25 MB` (Zero-GC compliance).
4. Detailed test assertions, execution flags (`node --expose-gc`), and integration into `npm test`.

Write your report to `report.md` and complete handoff in `handoff.md`.

## 2026-09-17T12:20:25Z
You are M1 Explorer 3 working in directory /Users/user/src/bomberman/.agents/m1_explorer_3/.
You MUST read /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md first.
Also read /Users/user/src/bomberman/PROJECT.md and /Users/user/src/bomberman/TEST_INFRA.md.
Design the 10,000-Frame Soak Test Harness:
1. tests/soak_10k_frames.test.mjs: Headless continuous simulation over 10,000 frames.
2. Simulates game loops, enemy pathfinding calls, bomb placements, detonations, particles.
3. Heap measurement: warmup 1k frames -> baseline heapUsed -> run 9k frames -> assert heap drift <= 0.25 MB.
Write your findings to report.md and create a self-contained handoff.md in your working directory. Send a message to your parent when done.

