# BRIEFING — 2026-09-18T18:59:50Z

## Mission
Remediate System, UI, Security, Bosses, and Crises defects for the Bomberman Total Inspection ("총검사") milestone.

## 🔒 My Identity
- Archetype: worker_system_remediation
- Roles: implementer, qa, specialist
- Working directory: /Users/user/src/bomberman/.agents/worker_system_remediation/
- Original parent: aa0b6d8f-15cd-47a9-98b9-32048d20bdc6
- Milestone: M8 / M9 (Total Inspection Remediation)

## 🔒 Key Constraints
- Exclusive file ownership ONLY:
  - src/game/bosses/TelegraphEngine.ts
  - src/game/bosses/BaseBoss.ts
  - src/game/bosses/HamsterBoss.ts
  - src/game/bosses/QueenBeeBoss.ts
  - src/game/crises/BaseCrisis.ts
  - src/game/progression/PerkTree.ts
  - src/game/progression/ScalingEngine.ts
  - src/game/persistence/CircuitBreaker.ts
  - src/game/persistence/GameStatePersistence.ts
  - src/components/BombermanGame.tsx
  - tests/bosses.test.mjs
  - tests/persistence.test.mjs
  - tests/hud_inventory_expansion.test.mjs
  - tests/chaos_resilience.test.mjs
- DO NOT touch files owned by Worker 1 (GameScene.ts, entities, pathfinding, AudioVoicePool, movement/ai tests).
- DO NOT CHEAT: No hardcoded test results, dummy facades, or skipped logic.
- Must run and pass `npm run test` and `npm run lint` cleanly with 0 errors.

## Current Parent
- Conversation ID: aa0b6d8f-15cd-47a9-98b9-32048d20bdc6
- Updated: not yet

## Task Summary
- **What to build/fix**:
  - UI-03: Fix NippleJS joystick diagonal dead zones at 135° and 225°.
  - UI-04: Fix action button input drop during rapid tapping and add onPointerCancel.
  - UI-05: Fix global key listener trapping typing in Backup modal textarea/inputs.
  - SEC-01: Fix CircuitBreaker queued request deadlock on non-429 retries.
  - SEC-02: Fix PerkTree prototype pollution crash on special property names.
  - SEC-03: Fix GameStatePersistence stale storage read after quota fallback.
  - SEC-04: Fix GameStatePersistence save package schema sanitization against negative/corrupted numbers.
  - ARCH-01: Fix TelegraphEngine swap-and-pop corruption in cancelAttack() and update().
  - ARCH-02: Fix BaseBoss post-combo i-frames overlapping stun window and allow death animation completion before dismissal.
  - ARCH-03: Fix QueenBeeBoss grounding/dive trigger and HamsterBoss arena bounds clamp.
  - ARCH-04: Fix BaseCrisis reset() clearing subclass state.
  - Add permanent defensive unit/integration tests in tests/bosses.test.mjs, tests/persistence.test.mjs, tests/hud_inventory_expansion.test.mjs, and tests/chaos_resilience.test.mjs.
- **Success criteria**: All tasks implemented genuinely, all tests passing, lint clean with 0 errors.
- **Interface contracts**: PROJECT.md & DISPATCH.md
- **Code layout**: src/game/ and src/components/

## Key Decisions Made
- [Initial]: Working through tasks systematically in order: UI fixes, Security fixes, Architecture fixes, Defensive tests, Verification.

## Artifact Index
- DISPATCH.md — Assignment and requirements
- handoff.md — Final handoff report upon completion
- progress.md — Heartbeat and step tracking

## Change Tracker
- **Files modified**: None yet
- **Build status**: Untested
- **Pending issues**: TBD

## Quality Status
- **Build/test result**: Untested
- **Lint status**: Untested
- **Tests added/modified**: None yet

## Loaded Skills
- None
