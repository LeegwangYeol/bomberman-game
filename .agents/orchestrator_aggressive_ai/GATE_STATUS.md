# Gate Status — Iteration 1

## Verification Swarm
| Agent | Role | Verdict | Source |
|-------|------|---------|--------|
| worker_impl | teamwork_preview_worker | DONE (517/517 pass, lint ok, build ok) | handoff.md |
| reviewer_1 | teamwork_preview_reviewer | APPROVE | handoff.md |
| reviewer_2 | teamwork_preview_reviewer | REQUEST_CHANGES | handoff.md |
| challenger_1 | teamwork_preview_challenger | REQUEST_CHANGES | handoff.md |
| challenger_2 | teamwork_preview_challenger | REQUEST_CHANGES | handoff.md |
| auditor | teamwork_preview_auditor | CLEAN | handoff.md |

Gate Result: **FAIL (Reviewer 2, Challenger 1, Challenger 2 REQUEST_CHANGES)**

### Required Remediations:
1. **Premature EVADING Exit Suicide Defect (`EnemyEntities.ts:175-177, 509-511`)**:
   - In `ChaserEnemy.updateAI` and `BomberEnemy.updateAI`, when `this.escapePath.length === 0`, do NOT switch to `TRACKING`/`HUNTING`. Set velocity to `(0, 0)` and remain in `EnemyState.EVADING` holding the safe retreat tile until `onBombExploded()` is invoked upon detonation (or `evadeTimeoutMs <= 0` watchdog fires).
2. **Hazard Mask Production Bug (`pathfinding.ts:1114`)**:
   - In `getSafeBombEscapePath`, add `FlatHazardMask` support:
     ```typescript
     if (existingBombs instanceof FlatHazardMask) {
       existingBombs.forEachHazard((br, bc) => simulatedBombs.add(`${br},${bc}`));
     } else if (existingBombs instanceof Set) { ... }
     ```
3. **False-Positive `hasDirectPath` on Unreachable Targets (`pathfinding.ts:576, 700, 1040`)**:
   - In `findPathWithDemolition`, if `!reachedTarget`, set `res.hasDirectPath = false;`.
   - In `findDemolitionPath`, return `null` if `res.pathLength === 0 || (!reachedTarget && res.blockingBlockIdx === -1)`.
4. **NaN Infinite Loop CPU Hang & Wall Pre-check (`pathfinding.ts:953, 1086`)**:
   - In `isTileInBlastRange`, add `!Number.isInteger(...)` guards.
   - In `getSafeBombEscapePath`, add `!Number.isInteger(r) || !Number.isInteger(c)` and wall check `if (startTileVal === TILE_WALL || startTileVal === TILE_BLOCK) return null;`.
5. **Cornering Distance Alignment (`EnemyEntities.ts:535-548`)**:
   - In `BomberEnemy.updateAI`, ensure cornering bomb drops only when enemy is on the trap tile or within bomb power distance (`dist <= this.bombPower`).
6. **Update Test Suite (`tests/aggressive_ai.test.mjs`)**:
   - Add assertion in Scenario A3 that enemy takes 0 damage and 0 suicides occur during continuous tick simulation.
