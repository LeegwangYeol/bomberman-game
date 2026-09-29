# Chaos QA Agent 2: Extreme Entity Clustering, Stacking & Blast Resolution Audit Report

**Date:** 2026-09-30  
**Division:** Chaos QA & Resilience Division  
**Role:** Chaos QA Agent 2  
**Target File:** `.agents/daily_evolution/chaos_2_entity_clustering.md`

---

## 1. Executive Summary & Mission Scope

Chaos QA Agent 2 was tasked with auditing and battle-testing extreme entity density, clustering, and stacking edge cases across the Bomberman game engine, specifically:
1. **Extreme Entity Clustering & Stacking Invariants:** Auditing scenarios where 100+ entities or 100+ bombs occupy the exact same tile or coordinate.
2. **Physics Resolution, Blast Radius Calculations & Separation Logic:** Verifying that physics bodies, blast raycast algorithms, and overlap separation routines do not crash, lock up, overflow the call stack, or produce `NaN` / `Infinity` coordinates.
3. **Continuous Swarm Soak Testing:** Verifying sustained real-time performance and zero memory leaks under multi-hundred-entity congestion.

During the audit, a critical vulnerability in `getBlastTiles` was identified and remediated: passing `NaN` or fractional tile coordinates previously threw an unhandled `TypeError: Cannot read properties of undefined (reading 'NaN')` due to unchecked array indexing into `map[nr][nc]`. In addition, an epicenter chain-reaction safeguard was added to `explodeBomb` to guarantee that if multiple bombs are ever stacked at the same tile, they cleanly detonate in a single tick without orphaned ticking fuses.

All 8 adversarial chaos test cases pass cleanly, and the full regression test suite of **776 tests** passes with 0 failures.

---

## 2. Deep Dive: Entity Clustering & Stacking Invariants

### 2.1 120+ Entities Stacked at Exact Same Coordinate `(200, 200)`
- **Arcade Physics Interaction:** In Phaser Arcade Physics, enemy entities do not register intra-faction colliders (`collider(enemies, enemies)` is intentionally omitted). This prevents explosive physics repulsion impulses, ping-pong jitter, and division-by-zero separation forces when multiple enemies occupy the same coordinate.
- **Overhead UI Decluttering & Adaptive LOD:**
  - When 120 entities occupy the exact same position, `OverheadUIManager.update` calculates `minDistance = 0` and `countWithin60 = 119` (≥ 2).
  - All 120 entities immediately transition to `'minimal'` LOD mode, hiding bulky name tags and preserving only essential HP bars and intent glyphs.
  - The vertical staggering loop safely resolves overlapping labels using directional accumulation. Even when raw offsets accumulate to large negative values, the vertical boundary clamp:
    ```ts
    const intendedY = entity.y + offsetsY[i];
    if (intendedY < 20) offsetsY[i] = 20 - entity.y;
    else if (intendedY > 500) offsetsY[i] = 500 - entity.y;
    ```
    strictly bounds all label positions within `[20, 500]` on-screen.
  - The horizontal clamp strictly bounds label centers within `[20, 580]`.
  - The Player Protection Bubble calculation evaluates `effectiveDist <= 20`, scaling target alpha to `0.0` or `0.15` without any division-by-zero risks (using constant divisors `18` and `12`).
- **AI & Movement Stability:**
  - AI steering across `ChaserEnemy`, `BomberEnemy`, `TankEnemy`, `GhostEnemy`, and `SplitterEnemy` uses directional sign clamping (`Math.sign(dx) * speed`) rather than unconstrained vector normalization `(dx / dist)`. When `dx === 0`, `Math.sign(0)` returns `0`, ensuring velocities never become `NaN`.

### 2.2 100+ Bombs Stacking Invariants
- **Placement Idempotency:**
  - `placeBomb()`, `placeEnemyBomb()`, and `placeAllyBomb()` all enforce atomic tile clearance checks before spawning:
    ```ts
    let hasBomb = false;
    this.bombs.getChildren().forEach((child) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b.active && b.x === centerX && b.y === centerY) {
        hasBomb = true;
      }
    });
    if (hasBomb) return false;
    ```
    This guarantees that duplicate bomb placements on the same tile are rejected with 100% idempotency.
- **Bomb Sliding & Conveyor Anti-Stacking:**
  - Kicked bombs (`tryKickBomb`) inspect the immediate target tile. If another bomb already occupies the target tile, the kick is aborted.
  - While sliding at 300 px/s, `bomb.getData('isSliding')` looks ahead by `Math.max(16, BOMB_KICK_SPEED * (delta / 1000) + 4)`. If an obstacle or another active bomb occupies the next tile, the bomb halts on the tile *prior* to the obstacle, resets velocity to `(0, 0)`, and snaps cleanly to tile center.
  - Conveyor drift (`PHYS-REV-04`) explicitly verifies `!bombBlocking` before allowing drift into adjacent cells.
- **Epicenter Detonation Cascade:**
  - If 100 bombs are forcibly stacked on the same tile (e.g., via chaos injection or state restoration), `explodeBomb` now includes an epicenter chain-reaction check:
    ```ts
    this.bombs.getChildren().forEach((child) => {
      const otherBomb = child as Phaser.Physics.Arcade.Sprite;
      if (otherBomb.active && otherBomb !== bomb) {
        const bCol = Math.floor(otherBomb.x / TILE_SIZE);
        const bRow = Math.floor(otherBomb.y / TILE_SIZE);
        if (bRow === actualRow && bCol === actualCol) {
          this.explodeBomb(otherBomb, bRow, bCol);
        }
      }
    });
    ```
  - This ensures that all stacked bombs detonate in a single tick without orphaned active fuses or lingering unexploded bombs inside the blast.

---

## 3. Physics Resolution & Blast Radius Hardening

### 3.1 Blast Radius Calculation Invariants (`getBlastTiles`)
- **Vulnerability Found:**
  Prior to remediation, `getBlastTiles` checked `center.r >= 0 && center.r < ROWS && center.c >= 0 && center.c < COLS` only for adding the center tile to the set. However, the subsequent raycast direction loop executed unconditionally:
  ```ts
  for (const dir of directions) {
    for (let i = 1; i <= power; i++) {
      const nr = center.r + dir.dr * i;
      const nc = center.c + dir.dc * i;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
      if (map[nr][nc] === TILE_WALL) break;
  ```
  In JavaScript, `NaN < 0` and `NaN >= ROWS` are both `false`. Consequently, if `center.r` was `NaN` or a float (e.g. `1.5`), `nr` became `NaN` or fractional. The boundary check failed to break, and `map[nr][nc]` attempted to index `map[NaN][nc]`, immediately crashing with:
  `TypeError: Cannot read properties of undefined (reading 'nc')`.
- **Remediation Implemented:**
  Added strict boundary, integer, and finite number guards at the entry of `getBlastTiles`:
  ```ts
  if (
    !center ||
    !Number.isInteger(center.r) ||
    !Number.isInteger(center.c) ||
    center.r < 0 ||
    center.r >= ROWS ||
    center.c < 0 ||
    center.c >= COLS ||
    !map ||
    !Number.isFinite(power) ||
    power < 0
  ) {
    return blast;
  }
  ```
  Additionally added safe map row access `if (!map[nr] || map[nr][nc] === TILE_WALL) break;` and power flooring `const intPower = Math.floor(power);`.
- **Validation:**
  Calls with `{ r: NaN, c: NaN }`, `{ r: 1.5, c: 2 }`, `{ r: -5, c: 100 }`, `power = NaN`, `power = -3`, or `map = null` now safely return an empty Set without throwing.
  Calls with extreme power (`power = 1000`) terminate gracefully at outer walls without exceeding arena dimensions or hanging.

### 3.2 Suicide Prevention & Escape Path Invariants
- `canSafelyPlaceBomb` and `getSafeBombEscapePath` were hardened to validate that `r`, `c`, and `power` are integers/finite numbers > 0.
- Corrupt inputs now immediately return `false` or `null` without running BFS traversals or touching shared scratch buffers.

### 3.3 Physics Body Invariant Guard & NaN Coordinate Sanitization
- `applyPhysicsBodyInvariantGuard` in `src/game/entities/BaseEntity.ts` was enhanced:
  ```ts
  mutableBody.updateBounds = function(this: MutableArcadeBody) {
    const sx = Number.isFinite(sprite.x) ? sprite.x : 0;
    const sy = Number.isFinite(sprite.y) ? sprite.y : 0;
    if (this.transform) {
      this.transform.x = sx;
      this.transform.y = sy;
  ...
  mutableBody.updateFromGameObject = function(this: MutableArcadeBody) {
    if (!Number.isFinite(sprite.x)) sprite.x = 0;
    if (!Number.isFinite(sprite.y)) sprite.y = 0;
  ```
- If an entity's position is corrupted to `NaN` or `Infinity`, the physics guard automatically sanitizes the coordinates to finite values (`0`), preventing `NaN` contamination of Arcade Physics quadtree calculations.

### 3.4 Multi-Entity Clearance via `ignoringColliders`
- When a bomb is dropped at the feet of overlapping entities, all overlapping entities are added to the bomb's `ignoringColliders` `Set`.
- Tested with 100 simultaneous entities: each entity suppresses collision separation while within the bomb's AABB.
- As entities exit the bomb tile in staggered fashion, each entity independently deregisters upon clearing the AABB (`!checkBodiesOverlap`).
- Once cleared, re-entry is strictly blocked for that entity, while remaining overlapping entities can still exit cleanly without deadlock or ping-pong jitter.

---

## 4. Empirical Verification & Test Results

A dedicated chaos test suite was implemented in `tests/chaos_entity_clustering_stacking.test.mjs`:

| Test ID | Test Description | Result | Execution Time |
|---|---|---|---|
| `CHAOS-CLUSTER-01` | 120 entities stacked at (200, 200) execute OverheadUIManager & AI updates without crash or NaN | **PASS** | 8.19 ms |
| `CHAOS-CLUSTER-02` | Bomb placement idempotency strictly rejects multiple bombs on identical tile | **PASS** | 0.23 ms |
| `CHAOS-CLUSTER-03` | Forced 100-bomb stack at epicenter cleanly chain-detonates in 1 tick without stack overflow | **PASS** | 11.96 ms |
| `CHAOS-CLUSTER-04` | `getBlastTiles` boundary & finite number guards eliminate crashes on NaN, float & extreme power | **PASS** | 3.97 ms |
| `CHAOS-CLUSTER-05` | `canSafelyPlaceBomb` & `getSafeBombEscapePath` reject corrupt inputs without throwing | **PASS** | 0.40 ms |
| `CHAOS-CLUSTER-06` | `applyPhysicsBodyInvariantGuard` restores valid finite numbers when NaN is set | **PASS** | 0.26 ms |
| `CHAOS-CLUSTER-07` | 100 entities overlapping single bomb tile clear independently via `ignoringColliders` | **PASS** | 0.38 ms |
| `CHAOS-CLUSTER-08` | 500-tick continuous soak with 100 entities and 50 ticking bombs maintains 0 NaN and bounded step time | **PASS** | 373.40 ms |

### 500-Tick Soak Test Metrics
- **Entities:** 100 active `ChaserEnemy` instances
- **Concurrent Bombs:** 50 active bomb tiles
- **Total Simulation Steps:** 500 ticks (~8.33 seconds of continuous 60 FPS gameplay)
- **Average Frame Processing Time:** **0.75 ms / frame** (well below the 16.67ms frame budget)
- **NaN Occurrences:** **0**
- **Crashes / Unhandled Exceptions:** **0**
- **Stack Overflows:** **0**

### Full Regression Test Suite
- Executed `npm test` covering all test suites:
- **Total Tests Passed:** **776 / 776**
- **Failures:** **0**
- **Regressions:** **0**

---

## 5. Files Modified

1. `src/game/pathfinding.ts`:
   - Added finite coordinate, integer, and boundary checks to `getBlastTiles`.
   - Added map null-check and safe row access guard `if (!map[nr] || map[nr][nc] === TILE_WALL) break;`.
   - Added finite power checks to `canSafelyPlaceBomb` and `getSafeBombEscapePath`.
2. `src/game/entities/BaseEntity.ts`:
   - Added `Number.isFinite` sanitization in `applyPhysicsBodyInvariantGuard` for `sprite.x`, `sprite.y`, and physics transform bounds.
3. `src/game/GameScene.ts`:
   - Added epicenter chain-reaction detonation in `explodeBomb` to detonate stacked bombs at the same tile cleanly.
4. `tests/chaos_entity_clustering_stacking.test.mjs`:
   - Created comprehensive 8-suite chaos test verifying entity stacking, bomb stacking, blast radius calculation guards, and 500-frame soak stability.

---

## 6. Conclusion

The Bomberman engine has been verified and hardened against extreme entity clustering, multi-bomb stacking, and adversarial coordinate corruptions. Under extreme density (120+ entities and 100+ bombs), the system maintains 100% stability, zero `NaN` coordinates, bounded frame times (< 1ms per frame), and zero stack overflows.
