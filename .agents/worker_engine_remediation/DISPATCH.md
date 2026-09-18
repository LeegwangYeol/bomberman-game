# Dispatch: Core Engine, Physics & AI Remediation Worker

## Working Directory
`/Users/user/src/bomberman/.agents/worker_engine_remediation/`

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

## Mandate & Tasks (Milestone M7)
1. **PHYS-01**: Fix permanent God-Mode on Extra Life revival in `GameScene.ts:2623-2631`: ensure `this.isInvulnerable` is reset to `false` via a timed callback after 3000ms (`shieldInvulnerableUntil`).
2. **PHYS-02**: Fix Kicked / Conveyor-drifted bomb detonation in `GameScene.ts:2231, 2319, 2361`: in `explodeBomb()`, determine the bomb's actual detonation coordinates dynamically from `Math.floor(bomb.x / TILE_SIZE)` and `Math.floor(bomb.y / TILE_SIZE)` instead of using stale closure arguments!
3. **PHYS-03**: Fix Conveyor Belt wall penetration and 60 FPS edge jitter in `GameScene.ts:1724-1732, 1791-1796`: perform AABB boundary checking (24x24 for player with 12px radius, 32x32 for bomb with 16px radius) before advancing position during conveyor push.
4. **PHYS-04**: Fix Diagonal Blast Leakage in `GameScene.ts:2470-2495`: set an explicit physics body size on explosion sprites with 2px inward margin (e.g. `setSize(36, 36).setOffset(2, 2)`) so entities diagonally adjacent across solid indestructible pillars are not hit.
5. **PHYS-05**: Fix Soft Block simultaneous raycast piercing in `GameScene.ts:2444-2450`: ensure block destruction ray terminates cleanly.
6. **PHYS-06**: Fix Single-Bomb multi-hit damage on bosses in `GameScene.ts:2499-2510`: record `bombId` on each explosion and track hit bombs per blast to ensure a single bomb deals exactly 1 damage hit to the active boss.
7. **PHYS-07**: Wire `corner_magnet` perk tolerance in `GameScene.ts:2115-2125` and ensure `WALL_PASS` / `BOMB_PASS` passability does not break corridor centering.
8. **AI-01**: Fix `ZeroGCPathfinder.init(rows, cols)` parameter order in `src/game/pathfinding.ts:286` to match `constructor(rows, cols)`.
9. **AI-02**: Fix `isTileInBlastRange` bounds checking in `src/game/pathfinding.ts:708` to guard `0 <= r < ROWS && 0 <= c < COLS`.
10. **AI-03**: Fix `ChaserEnemy` double-stun race in `src/game/entities/EnemyEntities.ts:114` so recovery happens in exactly 900ms.
11. **AI-04**: Fix `BomberEnemy` & `MiniBomberAlly` evasion deadlock in `src/game/entities/EnemyEntities.ts:316` by adding a timeout watchdog (max 2500ms evasion) and implement `onBombExploded()` on `BomberEnemy`.
12. **AI-05**: Fix `GhostEnemy` Ether Dash in `src/game/entities/EnemyEntities.ts:591-621` so dash velocity is preserved for the full dash duration.
13. **AI-06**: Fix `MerchantNPC` escape mask in `src/game/entities/NeutralEntities.ts:95` to pass full blast raycast tiles.
14. **AI-07**: Fix `PetDroneAlly` tractor beam movement in `src/game/entities/AllyEntities.ts:214` to scale by `(delta / 1000)`.
15. **AI-08**: Fix `SplitterEnemy` mini-slime spawn in `src/game/entities/EnemyEntities.ts:658` with tile validity checks.
16. **MEM-01**: Fix scene restart memory leak in `src/game/GameScene.ts`: add `shutdown()` lifecycle handler that unregisters `this.game.events.off('mode-changed')`.
17. **MEM-02**: Fix Web Audio node leaks in `src/game/ultimate_skills.ts`: schedule `osc.disconnect()` and `gain.disconnect()` when sound finishes, and clean up unmanaged timeouts.
18. **MEM-03**: Fix `AudioVoicePool.ts`: add `destroy()` / `disconnect()` and handle suspended audio contexts.
19. **UI-01**: In `GameScene.ts`, ensure `emitStatsUpdate()` is called when dash cooldown, ultimate lockout, or active buff timers update so React HUD timer bars never freeze.
20. **UI-02**: In `GameScene.ts:update()`, ensure `this.bossHUD.update(delta)` is invoked every frame so boss stun/shield timers advance smoothly.
21. **UI-06**: In `GameScene.ts`, register active listeners for `'perks-updated'`, `'relics-updated'`, and `'resume-run-state'` so state mutations synchronize to gameplay.
22. **Defensive Tests**: Add permanent defensive unit/integration tests for all fixed physical, AI, and engine errors in the test files you own.
23. **Verification**: Run `npm run test` and `npm run lint`. Ensure all tests pass with 0 errors!

## Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write your report to `/Users/user/src/bomberman/.agents/worker_engine_remediation/handoff.md` and report back via send_message to parent when complete.

## 2026-09-18T10:20:42Z
**Context**: Orchestrator heartbeat and liveness monitoring for Milestone M7.
**Content**: It has been 20 minutes since dispatch. Please provide a brief status update on your implementation progress across your assigned files and update your progress.md with your latest timestamp and completed tasks.
**Action**: Update progress.md with your current checklist status and reply with your progress summary.
