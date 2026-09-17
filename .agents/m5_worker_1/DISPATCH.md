## 2026-09-17T13:41:40Z

You are M5 Worker 1 working in directory /Users/user/src/bomberman/.agents/m5_worker_1/.
You MUST read /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md first.
Also read /Users/user/src/bomberman/PROJECT.md, /Users/user/src/bomberman/TEST_INFRA.md, and /Users/user/src/bomberman/.agents/explorer_survey_3/report.md (Sections 2 & 4: State Management, Persistence, 429 Recovery, and Chaos Bots).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks:
1. Implement src/game/persistence/PersistenceTypes.ts.
2. Implement src/game/persistence/GameStatePersistence.ts (dual-tier sessionStorage/localStorage, RLE compression, checksum validation, JSON export/import).
3. Implement src/game/persistence/CircuitBreaker.ts (API 429 exponential backoff, jitter, offline queue, circuit breaker states).
4. Integrate session resume and save/export controls into src/components/BombermanGame.tsx.
5. Implement tests/persistence.test.mjs (serialization, tampering, export/import, circuit breaker).
6. Implement tests/chaos_resilience.test.mjs (50,000-action adversarial chaos bot: multi-touch spam, boundary breaking, gauge overflow, fast pause/unpause, malformed inputs).
7. Run all verifications:
   - node --experimental-strip-types --test tests/persistence.test.mjs
   - node --experimental-strip-types --test tests/chaos_resilience.test.mjs
   - npm test
   - node --expose-gc --experimental-strip-types --test tests/soak_10k_frames.test.mjs
   - npm run lint
   - npm run build
Write a complete handoff.md and send message to parent when done.
