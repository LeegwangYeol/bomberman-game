# Dispatch: Core Engine, Physics & AI Remediation Worker (Replacement)

## 2026-09-18T13:12:33Z

## Working Directory
`/Users/user/src/bomberman/.agents/worker_engine_remediation_replace/`

## Context & Interruption Recovery
Your predecessor (`worker_engine_remediation`) completed:
- [x] Baseline test and lint verification
- [x] AI-01, AI-02 in `src/game/pathfinding.ts`
- [x] MEM-03 in `src/game/pooling/AudioVoicePool.ts`
- [x] ObjectPool teardown in `src/game/pooling/ObjectPool.ts`
- [x] MEM-02 in `src/game/ultimate_skills.ts`
- [x] AI-03 in `src/game/entities/EnemyEntities.ts`
- [x] AI-04 in `src/game/entities/EnemyEntities.ts` & `src/game/entities/AllyEntities.ts`
- [x] AI-05 in `src/game/entities/EnemyEntities.ts`
- [x] AI-06 in `src/game/entities/NeutralEntities.ts`
- [x] AI-07 in `src/game/entities/AllyEntities.ts`
- [x] AI-08 in `src/game/entities/EnemyEntities.ts`

Predecessor was interrupted during:
- PHYS-01..07, MEM-01, UI-01, UI-02, UI-06 in `src/game/GameScene.ts`
- Defensive unit/integration tests
- Final verification (`npm run test`, `npm run lint`)

## Exclusive File Ownership
You exclusively own and may edit ONLY these files:
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

Do NOT touch any files outside this list.

## Required Reading
- `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- `/Users/user/src/bomberman/.agents/explorer_inspect_physics/findings.md`
- `/Users/user/src/bomberman/.agents/explorer_inspect_ai/findings.md`
- `/Users/user/src/bomberman/.agents/explorer_inspect_memory/findings.md`
- `/Users/user/src/bomberman/.agents/worker_engine_remediation/progress.md`

## Mandate & Tasks
1. Verify state of predecessor's edits across `pathfinding.ts`, `AudioVoicePool.ts`, `ultimate_skills.ts`, `EnemyEntities.ts`, `NeutralEntities.ts`, `AllyEntities.ts`.
2. Implement remaining `GameScene.ts` fixes:
   - **PHYS-01**: Fix permanent God-Mode on Extra Life revival: ensure `this.isInvulnerable` is reset to `false` via a timed callback after 3000ms (`shieldInvulnerableUntil`).
   - **PHYS-02**: Fix Kicked / Conveyor-drifted bomb detonation: in `explodeBomb()`, determine the bomb's actual detonation coordinates dynamically from `Math.floor(bomb.x / TILE_SIZE)` and `Math.floor(bomb.y / TILE_SIZE)` instead of using stale closure arguments.
   - **PHYS-03**: Fix Conveyor Belt wall penetration and 60 FPS edge jitter: perform AABB boundary checking (24x24 for player with 12px radius, 32x32 for bomb with 16px radius) before advancing position during conveyor push.
   - **PHYS-04**: Fix Diagonal Blast Leakage: set an explicit physics body size on explosion sprites with 2px inward margin (e.g. `setSize(36, 36).setOffset(2, 2)`) so entities diagonally adjacent across solid pillars are not hit.
   - **PHYS-05**: Fix Soft Block simultaneous raycast piercing: ensure block destruction ray terminates cleanly.
   - **PHYS-06**: Fix Single-Bomb multi-hit damage on bosses: record `bombId` on each explosion and track hit bombs per blast to ensure a single bomb deals exactly 1 damage hit to the active boss.
   - **PHYS-07**: Wire `corner_magnet` perk tolerance and ensure `WALL_PASS` / `BOMB_PASS` passability does not break corridor centering.
   - **MEM-01**: Add `shutdown()` lifecycle handler that unregisters `this.game.events.off('mode-changed')`.
   - **UI-01**: In `GameScene.ts`, ensure `emitStatsUpdate()` is called when dash cooldown, ultimate lockout, or active buff timers update.
   - **UI-02**: In `GameScene.ts:update()`, ensure `this.bossHUD.update(delta)` is invoked every frame.
   - **UI-06**: In `GameScene.ts`, register active listeners for `'perks-updated'`, `'relics-updated'`, and `'resume-run-state'`.
3. Add permanent defensive unit/integration tests in `tests/player_movement_stress.test.mjs`, `tests/ai_pathfinding_stress.test.mjs`, `tests/bomb_lifecycle.test.mjs`.
4. Run `npm run test` and `npm run lint`. Ensure all tests pass with 0 errors!

## Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write your completion handoff report to `/Users/user/src/bomberman/.agents/worker_engine_remediation_replace/handoff.md` and report back via send_message to parent when complete.
