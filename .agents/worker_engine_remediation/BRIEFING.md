# BRIEFING — 2026-09-18T19:01:00Z

## Mission
Remediate all Core Engine, Physics, AI, and Audio defects (PHYS-01..07, AI-01..08, MEM-01..03, UI-01, UI-02, UI-06) for the Bomberman Total Inspection ("총검사") milestone with 100% test pass and zero lint/build errors.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /Users/user/src/bomberman/.agents/worker_engine_remediation
- Original parent: aa0b6d8f-15cd-47a9-98b9-32048d20bdc6
- Milestone: M7 - Core Engine, Physics & AI Remediation

## 🔒 Key Constraints
- Exclusive file ownership: ONLY edit:
  - `src/game/GameScene.ts`
  - `src/game/pathfinding.ts`
  - `src/game/entities/BaseEntity.ts`
  - `src/game/entities/EnemyEntities.ts`
  - `src/game/entities/NeutralEntities.ts`
  - `src/game/entities/AllyEntities.ts`
  - `src/game/ultimate_skills.ts`
  - `src/game/pooling/AudioVoicePool.ts`
  - `src/game/pooling/ObjectPool.ts`
  - `tests/player_movement_stress.test.mjs`
  - `tests/ai_pathfinding_stress.test.mjs`
  - `tests/bomb_lifecycle.test.mjs`
- DO NOT touch any files outside this exclusive list.
- DO NOT cheat: genuine logic, real state and real behavior, zero hardcoded dummy results.
- Zero-GC and minimal memory allocations preserved.
- Full verification: `npm run test` and `npm run lint` must pass cleanly with 0 errors.

## Current Parent
- Conversation ID: aa0b6d8f-15cd-47a9-98b9-32048d20bdc6
- Updated: not yet

## Task Summary
- **What to build**:
  - PHYS-01: Fix permanent god-mode on extra life revival (timed reset of `isInvulnerable` to false after 3000ms).
  - PHYS-02: Fix kicked/conveyor bomb explosion coordinates (compute dynamically from bomb sprite position).
  - PHYS-03: Fix conveyor belt wall penetration (AABB bounds check before advancing).
  - PHYS-04: Fix diagonal blast damage leakage (shrink explosion physics body size with inward margin).
  - PHYS-05: Fix soft block simultaneous ray piercing (clean ray termination).
  - PHYS-06: Fix single bomb multi-hit damage on bosses (record bombId per blast, max 1 hit per bomb).
  - PHYS-07: Connect corner_magnet perk and verify WALL_PASS / BOMB_PASS corridor centering.
  - AI-01: Fix `ZeroGCPathfinder.init(rows, cols)` parameter order.
  - AI-02: Fix `isTileInBlastRange` bounds checking.
  - AI-03: Fix `ChaserEnemy` double stun race (recovery in 900ms).
  - AI-04: Fix `BomberEnemy` & `MiniBomberAlly` evasion freeze (watchdog + `onBombExploded`).
  - AI-05: Fix `GhostEnemy` Ether Dash velocity preservation.
  - AI-06: Fix `MerchantNPC` flee mask with full blast raycast tiles.
  - AI-07: Fix `PetDroneAlly` tractor beam delta scaling.
  - AI-08: Fix `SplitterEnemy` mini-slime spawn bounds.
  - MEM-01: Fix `GameScene` mode-changed listener leak on restart.
  - MEM-02: Fix WebAudio node disconnects in `ultimate_skills.ts`.
  - MEM-03: Fix `AudioVoicePool.ts` destroy/disconnect & suspended context handling.
  - UI-01, UI-02, UI-06: Emit stats updates on timers, update `bossHUD` in `update()`, listen for perks/relics updates.
  - Add permanent defensive tests in owned test files.
- **Success criteria**: All defects remediated, defensive tests added, `npm run test` and `npm run lint` exit with 0 errors.
- **Interface contracts**: PROJECT.md § Interface Contracts.
- **Code layout**: PROJECT.md § Architecture.

## Key Decisions Made
- Will follow a systematic approach: Pathfinding & Pool fixes first, then Entities, then GameScene physics & lifecycle, then tests & linting.

## Artifact Index
- `.agents/worker_engine_remediation/DISPATCH.md` — assignment details
- `.agents/worker_engine_remediation/BRIEFING.md` — persistent working memory
- `.agents/worker_engine_remediation/progress.md` — liveness heartbeat
- `.agents/worker_engine_remediation/handoff.md` — final handoff report

## Change Tracker
- **Files modified**: None yet
- **Build status**: Pending
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pending initial test run
- **Lint status**: Pending
- **Tests added/modified**: Pending

## Loaded Skills
- None
