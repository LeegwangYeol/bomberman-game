# Comprehensive AI & Pathfinding Inspection Report ("총검사")

**Inspector**: Expert AI & Pathfinding Inspector  
**Milestone**: Bomberman Codebase Total Inspection ("총검사")  
**Date**: 2026-09-18  
**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_inspect_ai/`  
**Scope**: `src/game/pathfinding.ts`, `src/game/entities/*`, `src/game/bosses/*`, `src/game/GameScene.ts`

---

## Executive Summary

A comprehensive forensic inspection of the Bomberman pathfinding engines, enemy finite state machines (FSM), ghost mechanics, suicide-prevention invariants, and ally subsystems was conducted. While core BFS routines and typed array data structures show strong foundational design, multiple critical failure modes, architectural desynchronizations, and frame-rate dependencies were uncovered:

1. **ZeroGCPathfinder & Utility Invariants**:
   - **Parameter Inversion Trap**: `ZeroGCPathfinder.constructor(rows, cols)` vs `ZeroGCPathfinder.init(cols, rows)` flips dimensions if called conventionally.
   - **Off-Grid Array Crash in `isTileInBlastRange`**: Unchecked coordinates trigger `TypeError: Cannot read properties of undefined` on negative/out-of-bounds indices.
   - **Pseudo Zero-GC Leak**: While `ZeroGCPathfinder.findPath()` is allocation-free, all entities route through `findPathBFS()`, which allocates `new Array(len)` and `{r, c}` coordinate objects on every frame.
   - **Dirty Buffer Re-Use in `populateObstacleMask`**: Singleton `sharedObstacleMask` is not zeroed before copying non-square or partial maps.

2. **Enemy FSM State Deadlocks & Timer Flaws**:
   - **ChaserEnemy Double-Stun Bug**: `BaseEntity.updateEntity` clears `isStunned` before `ChaserEnemy.updateAI` runs, bypassing state transition to `TRACKING` and forcing an extra 900ms `COOLDOWN` timer (1800ms recovery total).
   - **BomberEnemy Permanent Evasion Softlock**: `EnemyState.EVADING` lacks a timeout watchdog or recovery callback; if the escape path is obstructed, the bomber is stuck in evasion forever.
   - **Missing `onBombExploded` Implementation**: `MockEnemyModel` implemented `onBombExploded()` in unit tests, but `BomberEnemy` in production code lacks this method, leaving evasion unreleased upon detonation.
   - **Unvalidated Splitter Spawns**: `SplitterEnemy.onDeath` spawns mini-slimes at `(ec - 1)` and `(ec + 1)` without wall or block collision validation, embedding slimes inside solid geometry.

3. **Ghost Phasing & Rematerialization**:
   - **Ether Dash 1-Frame Cancellation**: The 260 px/s dash is overwritten on the very next frame (16.6ms) by the path-following routine (45.5 px/s), rendering the dash imperceptible.
   - **Incomplete Rematerialization**: `GameScene.ts` unconditionally allows `GhostEnemy` to pass through `this.blocks`; materialization is purely visual and provides no physical presence.

4. **Suicide-Prevention Invariant**:
   - **Multi-Bomb Blindness**: `BomberEnemy` only evaluates blast danger for its own newly placed bomb, remaining oblivious to ticking bombs already placed by player or other enemies.
   - **Dynamic Hazard & Conveyor Vulnerability**: Escape calculations do not account for conveyor belt drift (60 px/s) or expanding map crises (lava/void/solar), leading to inescapable suicide during quick-fuse countdowns.
   - **MerchantNPC Flee Path Defect**: `MerchantNPC` passes `bombTiles` instead of blast tiles to `findEscapePathBFS`, causing `escapePath` to resolve to `[]` and leaving the NPC standing directly in fatal explosions.

5. **Ally Behavior**:
   - **Frame-Rate Dependent Pet Drone Vacuum**: Item attraction uses hardcoded `2.5 px/frame`, causing item retrieval speeds to vary wildly from 75 px/s (30 FPS) to 300 px/s (120 FPS).
   - **Tween Y-Jitter**: Looping bobbing tweens in `spawnItem` continuously overwrite `item.y`, fighting against magnetic and drone attraction vectors.
   - **Phantom Taunt & Flying Overlap Glitch**: Shield Guard's taunt only alters UI emojis without redirecting enemy pathfinding targets, and aerial Pet Drones take ground melee damage from enemies below them.

---

## 1. Deep Inspection: ZeroGCPathfinder & Flat Array Indexing

### 1.1 Parameter Order Mismatch (`constructor` vs `init`)
* **Location**: `src/game/pathfinding.ts:272` and `src/game/pathfinding.ts:286`
* **Observation**:
  ```ts
  // Line 272:
  constructor(rows: number = ROWS, cols: number = COLS) {
    this.rows = rows;
    this.cols = cols;
    this.totalTiles = rows * cols;
    ...
  }

  // Line 286:
  public init(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.totalTiles = rows * cols;
    ...
  }
  ```
* **Risk / Impact**:
  In `constructor`, argument 1 is `rows` (13) and argument 2 is `cols` (15). In `init`, argument 1 is `cols` and argument 2 is `rows`. If any caller invokes `pathfinder.init(rows, cols)` following standard constructor conventions, `this.cols` becomes 13 and `this.rows` becomes 15. Subsequent 1D coordinate translations (`currR = (curr / cols) | 0; currC = curr % cols; nIdx = nr * cols + nc`) will operate on an inverted pitch, reading and writing out-of-bounds or diagonally sheared grid nodes.
* **Proposed Remediation**:
  Standardize `init` signature to `public init(rows: number, cols: number): void` to align strictly with the constructor and standard `(row, col)` matrix conventions.

### 1.2 Coordinate Bounds Violation in `isTileInBlastRange`
* **Location**: `src/game/pathfinding.ts:708-718`
* **Observation**:
  ```ts
  let r = cr + dr;
  let c = cc + dc;
  while (r !== tr || c !== tc) {
    const tileVal = Array.isArray(map) ? map[r][c] : map[r * COLS + c];
    if (tileVal === TILE_WALL || tileVal === TILE_BLOCK) return false;
    r += dr;
    c += dc;
  }
  const destVal = Array.isArray(map) ? map[tr][tc] : map[tr * COLS + tc];
  if (destVal === TILE_WALL) return false;
  return true;
  ```
* **Risk / Impact**:
  Neither `tr`, `tc`, `cr`, nor `cc` are validated against `0 <= r < ROWS` and `0 <= c < COLS`. If an entity queries `isTileInBlastRange` with an off-grid coordinate (e.g. from off-screen projectile, boundary sliding, or negative coordinates), `Array.isArray(map) ? map[r][c]` attempts to access `undefined[c]`, throwing an unhandled `TypeError: Cannot read properties of undefined` and crashing the scene.
* **Proposed Remediation**:
  Add an immediate entry guard:
  ```ts
  if (tr < 0 || tr >= ROWS || tc < 0 || tc >= COLS || cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS) {
    return false;
  }
  ```

### 1.3 `populateObstacleMask` Reused Buffer Contamination
* **Location**: `src/game/pathfinding.ts:530-545`
* **Observation**:
  ```ts
  function populateObstacleMask(map: number[][] | Uint8Array, outMask: Uint8Array): void {
    if (map instanceof Uint8Array) {
      outMask.set(map);
      return;
    }
    const rMax = Math.min(ROWS, map.length);
    for (let r = 0; r < rMax; r++) {
      const row = map[r];
      if (!row) continue;
      const base = r * COLS;
      const cMax = Math.min(COLS, row.length);
      for (let c = 0; c < cMax; c++) {
        outMask[base + c] = row[c];
      }
    }
  }
  ```
* **Risk / Impact**:
  Unlike `populateMaskFromSetOrArray` (which explicitly executes `outMask.fill(0)` at line 551), `populateObstacleMask` does NOT clear `outMask` prior to copying. When called with a jagged or smaller map structure, residual obstacles from previous frames remain in the high indices of `sharedObstacleMask`, causing pathfinding to treat empty tiles as non-traversable walls.
* **Proposed Remediation**:
  Insert `outMask.fill(0)` at the beginning of `populateObstacleMask`.

### 1.4 Broken Zero-GC Abstraction in Entity AI Loop
* **Location**: `src/game/pathfinding.ts:576-606` and `src/game/entities/EnemyEntities.ts:150, 369, 500, 587, 706`
* **Observation**:
  While `zeroGCPathfinder.findPath(startIdx, targetIdx, outPathBuffer, ...)` achieves zero memory allocation, the exported helper `findPathBFS` wraps this by instantiating `new Array(len)` and allocating `{ r: ..., c: ... }` heap objects for each path step:
  ```ts
  const path: GridCoord[] = new Array(len);
  for (let i = 0; i < len; i++) {
    const idx = outPathBuffer[i];
    path[i] = { r: (idx / COLS) | 0, c: idx % COLS };
  }
  return path;
  ```
  Every enemy (`ChaserEnemy`, `BomberEnemy`, `TankEnemy`, `GhostEnemy`, `SplitterEnemy`) and ally (`MiniBomberAlly`) queries `findPathBFS` on a 200–350ms interval, continuously generating intermediate arrays and coordinate dictionaries in V8 memory.
* **Proposed Remediation**:
  Provide a reusable typed-array path buffer per entity or store 1D index paths directly on the entity (`private currentPathIndices = new Int16Array(TOTAL_TILES); private pathLength = 0;`), stepping through indices with `idxToRow` and `idxToCol` math without object creation.

---

## 2. Deep Inspection: Enemy & Boss Finite State Machines (FSM)

### 2.1 ChaserEnemy Stun/Cooldown Double Duration Glitch
* **Location**: `src/game/entities/BaseEntity.ts:162-165` & `src/game/entities/EnemyEntities.ts:112-120, 195-201`
* **Execution Trace**:
  1. `ChaserEnemy.changeState(EnemyState.COOLDOWN)` is invoked upon dash impact:
     ```ts
     this.isStunned = true;
     this.stunUntil = (this.scene?.time?.now || 0) + this.config.stunMs; // +900ms
     this.stateTimer = this.config.stunMs; // 900ms
     ```
  2. While `this.isStunned === true`, `updateAI` enters:
     ```ts
     this.updateEntity(delta, currentTime);
     if (this.isStunned) {
       if (currentTime >= this.stunUntil) {
         this.isStunned = false;
         this.changeState(EnemyState.TRACKING);
       }
       return; // Returns immediately! Line 195 (stateTimer -= delta) NEVER runs!
     }
     ```
  3. When `currentTime >= this.stunUntil` occurs, `this.updateEntity(delta, currentTime)` executes FIRST at line 112:
     ```ts
     // BaseEntity.ts:162:
     if (this.isStunned && currentTime >= this.stunUntil) {
       this.isStunned = false;
       this.overheadUI.setIntent('', false);
     }
     ```
  4. Now `this.isStunned` is already `false` when line 114 is evaluated! The `if (this.isStunned)` block is SKIPPED entirely. Line 117 (`this.changeState(EnemyState.TRACKING)`) is NEVER CALLED!
  5. Execution falls through to line 195:
     ```ts
     case EnemyState.COOLDOWN:
       this.stateTimer -= delta;
       if (this.stateTimer <= 0) {
         this.changeState(EnemyState.TRACKING);
       }
       break;
     ```
  6. Since `this.stateTimer` was never decremented while `isStunned` was active, it begins counting down from 900ms to 0.
  7. **Total recovery time is 900ms + 900ms = 1800ms (exactly 2x the intended duration)**.
* **Proposed Remediation**:
  Remove `this.isStunned = true` from `COOLDOWN` state transition, or unify state recovery exclusively within `ChaserEnemy.updateAI`.

### 2.2 BomberEnemy & MiniBomber Permanent Evasion Deadlock
* **Location**: `src/game/entities/EnemyEntities.ts:316-342` & `src/game/entities/AllyEntities.ts:71-90`
* **Observation**:
  ```ts
  if (this.aiState === EnemyState.EVADING) {
    if (this.escapePath.length > 0) {
      const next = this.escapePath[0];
      const targetX = next.c * TILE_SIZE + TILE_SIZE / 2;
      const targetY = next.r * TILE_SIZE + TILE_SIZE / 2;
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      ...
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
        this.escapePath.shift();
        if (this.escapePath.length === 0) {
          this.changeState(this.hp === 1 ? EnemyState.ENRAGED : EnemyState.HUNTING);
        }
      }
    } else {
      this.changeState(this.hp === 1 ? EnemyState.ENRAGED : EnemyState.HUNTING);
    }
    return;
  }
  ```
* **Failure Scenario**:
  - `BomberEnemy` drops a bomb and sets `this.escapePath = safeEscape`.
  - While traversing `escapePath[0]`, another entity (e.g. Tank, player, or spawned block) blocks the corridor, or physics wall friction prevents reaching within 4px of `targetX, targetY`.
  - Because `escapePath[0]` is never reached, `escapePath.shift()` is never triggered.
  - There is NO timeout timer or watchdog on `EnemyState.EVADING`.
  - Line 341 executes `return;` on every single frame indefinitely.
  - Result: `BomberEnemy` and `MiniBomberAlly` become permanently immobilized, unable to pathfind, leash, or plant bombs for the remainder of the session.
* **Proposed Remediation**:
  Add an evasion watchdog timer (e.g., `evadeTimeoutMs = 3500`). If `evadeTimeoutMs <= 0`, clear `escapePath` and transition back to `HUNTING` or `TRACKING`.

### 2.3 Splitter Unsafe Mini-Slime Wall Embedding
* **Location**: `src/game/entities/EnemyEntities.ts:658-672`
* **Observation**:
  ```ts
  const leftC = Math.max(1, ec - 1);
  const rightC = Math.min(COLS - 2, ec + 1);

  const mini1 = new MiniSplitterEnemy(
    this.scene,
    leftC * TILE_SIZE + TILE_SIZE / 2,
    er * TILE_SIZE + TILE_SIZE / 2
  );
  const mini2 = new MiniSplitterEnemy(
    this.scene,
    rightC * TILE_SIZE + TILE_SIZE / 2,
    er * TILE_SIZE + TILE_SIZE / 2
  );
  ```
* **Failure Scenario**:
  If `SplitterEnemy` is defeated in a vertical corridor where `(er, ec - 1)` or `(er, ec + 1)` is a solid wall (`TILE_WALL`) or block (`TILE_BLOCK`), `mini1` or `mini2` is instantiated directly inside solid geometry. Arcade physics cannot separate sprites completely enclosed by adjacent walls, leaving mini-slimes glitching in place or clipping through the map perimeter.
* **Proposed Remediation**:
  Iterate orthogonal and diagonal neighbor tiles, spawning mini-slimes only on tiles where `map[r][c] === TILE_EMPTY` and no active bombs exist.

### 2.4 Boss FSM Failures: Hamster Boundary Escape & Queen Bee Invulnerability
* **Location**: `src/game/bosses/HamsterBoss.ts:86-90, 154-170` & `src/game/bosses/QueenBeeBoss.ts:59-65, 102-132`
* **Observations**:
  1. **HamsterBoss Out-of-Bounds**: In `HamsterBoss.updateDashCombat`, when `isDashing === true`, the boss updates its position linearly (`this.x += this.dashDirection.x * this.dashSpeed * dt`). However, `HamsterBoss` is simulated without an Arcade physics body, and `onWallImpact()` is never called in `GameScene.ts` or `BaseBoss.ts`. Dashing Captain Nibbles flies through the arena wall and leaves the visible game viewport permanently.
  2. **QueenBee Permanent Invulnerability**: `QueenBeeBoss.canTakeDamage()` returns `true` ONLY when `this.isGrounded && this.bossState === BossState.STUNNED`. However, `QueenBeeBoss` starts with `isGrounded = false`, and its combat loop `updateFlightLoop` never triggers `initiateRoyalDive()` or grounds the boss. Furthermore, neither `snipeFromSky()` nor `popShield()` are integrated into `GameScene.ts`. Therefore, Queen Bee can NEVER be damaged or defeated in actual gameplay.

---

## 3. Deep Inspection: Ghost Phasing & Rematerialization

### 3.1 Ether Dash 1-Frame Cancellation Glitch
* **Location**: `src/game/entities/EnemyEntities.ts:591-622`
* **Observation**:
  ```ts
  // Frame N:
  if (!this.isMaterialized && this.dashCooldownTimer <= 0 && dist <= 4) {
    this.dashCooldownTimer = 5000;
    this.isMaterialized = true;
    this.materializeUntil = currentTime + this.config.materializeDelayMs;
    this.setAlpha(1.0);
    this.overheadUI.setIntent('⚡', true);
    ...
    this.setVelocity(Math.sign(dx) * this.config.dashSpeed, 0); // 260 px/s
    return;
  }

  // Frame N + 1 (16.6ms later):
  if (this.currentPath.length > 0) {
    ...
    const speed = this.isMaterialized ? this.config.phaseSpeed * 0.7 : this.config.phaseSpeed; // 45.5 px/s
    this.setVelocity(Math.sign(dx) * speed, 0);
  }
  ```
* **Failure Scenario**:
  On the frame the dash begins, velocity is set to 260 px/s and `return;` is executed. On the next frame, `isMaterialized` is `true`, so the dash entry condition is skipped. Execution falls through to line 608. Because `this.currentPath` still has remaining nodes, line 617 immediately resets velocity to 45.5 px/s (`phaseSpeed * 0.7`). The 260 px/s dash is active for exactly ONE frame (approx. 4.3 pixels of movement), after which the ghost crawls at sub-patrol speed for the remaining 1483ms of its "materialized" duration.
* **Proposed Remediation**:
  Add an explicit `isDashing` boolean or state timer (`dashDurationMs = 500`). While dashing, bypass the path-following block until dash completion or wall collision.

### 3.2 Rematerialization Block Collider Disconnect
* **Location**: `src/game/GameScene.ts:1158-1164`
* **Observation**:
  ```ts
  this.physics.add.collider(this.enemies, this.blocks, undefined, (enemyObj) => {
    // Ghost phases through soft blocks!
    if (enemyObj instanceof GhostEnemy) return false;
    ...
    return true;
  });
  ```
* **Risk / Impact**:
  The collider callback unconditionally returns `false` for `GhostEnemy`, regardless of whether `enemy.isMaterialized` is `true` or `false`. Consequently, "materialization" does not restore physical collision with soft blocks. If a ghost materializes inside a block, it remains fully intangible to that block.

---

## 4. Deep Inspection: Suicide-Prevention Invariant

### 4.1 Tunnel-Vision on Secondary & Moving Hazards
* **Location**: `src/game/entities/EnemyEntities.ts:345-350`
* **Observation**:
  ```ts
  if (this.bombCooldownTimer <= 0 && this.activeBombs < this.maxBombs && dist <= 3) {
    const dangerTiles = getBlastTiles({ r: er, c: ec }, this.bombPower, map);
    const simulatedBombTiles = new Set(bombTiles);
    simulatedBombTiles.add(`${er},${ec}`);

    const safeEscape = findEscapePathBFS({ r: er, c: ec }, dangerTiles, map, simulatedBombTiles, 4);
  ```
* **Vulnerability Analysis**:
  1. `dangerTiles` passed to `findEscapePathBFS` contains ONLY the blast projection of the bomb *about to be dropped*.
  2. If the player or an ally already placed a ticking bomb nearby, that bomb is present in `simulatedBombTiles` (treated as an impassable obstacle), but its *blast tiles* are NOT in `dangerTiles`!
  3. The escape pathfinder identifies an "exit" tile that is outside the newly dropped bomb's radius, but directly inside the blast radius of the pre-existing bomb. The enemy happily drops its bomb and walks straight into the existing bomb's explosion.
  4. Moving environmental hazards (e.g. `persistentHazardMask`, Lava Fissure expansion, Solar Flare corridor beams) and central conveyor belts (60 px/s drift) are completely absent from the danger mask.

### 4.2 MerchantNPC Fatal Escape Path Logic Error
* **Location**: `src/game/entities/NeutralEntities.ts:83-98`
* **Observation**:
  ```ts
  if (nearBomb) {
    this.overheadUI.setIntent('😱', true);
    if (this.fleePath.length === 0) {
      const escape = findEscapePathBFS({ r: mr, c: mc }, bombTiles, map, bombTiles, 4);
      if (escape) this.fleePath = escape;
    }
  ```
* **Fatal Logic Defect**:
  `MerchantNPC` passes `bombTiles` as the second argument (`dangerTiles`) to `findEscapePathBFS`!
  - `bombTiles` contains only the center coordinate of the bomb (e.g., `["1,4"]`).
  - The Merchant is at `(1, 2)`.
  - In `zeroGCPathfinder.findSafeTile`:
    ```ts
    if (dangerMask[startIdx] === 0) return 0;
    ```
  - Because `dangerMask` only has the bomb's tile `(1, 4)` set to 1, the Merchant's tile `(1, 2)` evaluates to `dangerMask[startIdx] === 0`!
  - `findSafeTile` returns `0`, which `findEscapePathBFS` returns as `[]`.
  - Therefore, `this.fleePath` remains `[]`. Line 99 (`if (this.fleePath.length > 0)`) evaluates to `false`.
  - **The Merchant NEVER FLEES. It displays the '😱' emoji and remains standing in the bomb's blast path until it is vaporized.**
* **Proposed Remediation**:
  Calculate all active blast tiles from `bombTiles` using `getBlastTiles()` and pass the cumulative hazard set to `findEscapePathBFS`.

---

## 5. Deep Inspection: Ally Behavior & Subsystems

### 5.1 PetDrone Frame-Rate Dependent Tractor Beam
* **Location**: `src/game/entities/AllyEntities.ts:214-215`
* **Observation**:
  ```ts
  // Tractor beam pulls item towards player or drone flies to item
  const angle = Phaser.Math.Angle.Between(closestItem.x, closestItem.y, player.x, player.y);
  closestItem.x += Math.cos(angle) * 2.5;
  closestItem.y += Math.sin(angle) * 2.5;
  ```
* **Risk / Impact**:
  Displacement is incremented by a fixed constant of `2.5` pixels per frame, without `delta` scaling.
  - At 30 FPS (mobile throttling): Pull speed is $2.5 \times 30 = 75\text{ px/s}$.
  - At 60 FPS (standard): Pull speed is $2.5 \times 60 = 150\text{ px/s}$.
  - At 120 FPS (high refresh displays): Pull speed is $2.5 \times 120 = 300\text{ px/s}$ (4x faster than at 30 FPS).
* **Proposed Remediation**:
  Scale by delta:
  ```ts
  const step = 150 * (delta / 1000);
  closestItem.x += Math.cos(angle) * step;
  closestItem.y += Math.sin(angle) * step;
  ```

### 5.2 Item Bobbing Tween vs Magnet/Drone Y-Axis Stutter
* **Location**: `src/game/GameScene.ts:3151-3158`
* **Observation**:
  ```ts
  this.tweens.add({
    targets: item,
    y: centerY - 4,
    duration: 450,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  ```
* **Risk / Impact**:
  Each dropped item runs an infinite looping tween targeting `y`. When `PetDroneAlly` or `hasMagnet` modifies `item.y`, Phaser's tween manager overwrites `item.y` on every frame to match the sine oscillation curve. This causes rapid jittering where the item moves smoothly along X but violently snaps back and forth along Y.
* **Proposed Remediation**:
  When an item enters magnetic attraction, cancel its bobbing tween via `this.scene.tweens.killTweensOf(item)` or apply movement to an offset container.

### 5.3 Shield Guard "Phantom Taunt" & Infinite Absorption Exploit
* **Location**: `src/game/entities/AllyEntities.ts:341-345` & `src/game/entities/AllyEntities.ts:392-397`
* **Observations**:
  1. **Phantom Taunt**: `ShieldGuardAlly` emits a taunt wave that sets `e.overheadUI.setIntent('💢', true)`. However, no enemy class inspects this intent or changes target; all enemies remain hardcoded to follow `(player.x, player.y)`.
  2. **Free Absorption Exploit**: In `tryAbsorbExplosionForPlayer`, `this.takeDamage(1, ...)` is called. During the 800ms i-frame period following a hit, `BaseEntity.takeDamage` returns `false` without docking HP. However, `tryAbsorbExplosionForPlayer` unconditionally returns `true`. Consequently, Shield Guard can absorb dozens of concurrent explosion tiles, protecting the player while taking 0 damage.

---

## 6. Summary Matrix of Discovered Issues

| # | Subsystem | Severity | File & Line | Root Cause |
|---|-----------|----------|-------------|------------|
| 1 | ZeroGCPathfinder | **HIGH** | `pathfinding.ts:286` | Parameter inversion `(cols, rows)` vs `(rows, cols)` corrupts pitch |
| 2 | ZeroGCPathfinder | **HIGH** | `pathfinding.ts:708` | `isTileInBlastRange` lacks bounds checking; crashes on off-grid indices |
| 3 | ZeroGCPathfinder | **MEDIUM** | `pathfinding.ts:530` | `populateObstacleMask` reuses buffer without `fill(0)`, retaining stale data |
| 4 | ZeroGCPathfinder | **MEDIUM** | `pathfinding.ts:600` | Wrapper `findPathBFS` allocates arrays and objects, violating Zero-GC |
| 5 | ChaserEnemy FSM | **HIGH** | `EnemyEntities.ts:114` | Stun duration doubled (1800ms) due to `BaseEntity.updateEntity` race |
| 6 | BomberEnemy FSM | **CRITICAL** | `EnemyEntities.ts:316` | Missing evasion timeout leaves bomber permanently stuck in `EVADING` |
| 7 | BomberEnemy FSM | **HIGH** | `EnemyEntities.ts:228` | Missing `onBombExploded()` implementation leaves bomber in evasion |
| 8 | SplitterEnemy | **MEDIUM** | `EnemyEntities.ts:658` | Spawns mini-slimes at fixed offsets without wall collision checking |
| 9 | HamsterBoss FSM | **CRITICAL** | `HamsterBoss.ts:86` | Unbounded dash and uncalled `onWallImpact()` allows boss to fly off-screen |
| 10 | QueenBeeBoss FSM | **CRITICAL** | `QueenBeeBoss.ts:62` | Boss permanently flying and invincible; dive/grounding triggers uncalled |
| 11 | GhostEnemy | **HIGH** | `EnemyEntities.ts:608` | Ether Dash velocity (260 px/s) overwritten on frame 2 (lasts 16ms) |
| 12 | GhostEnemy | **LOW** | `GameScene.ts:1160` | Rematerialization does not re-enable soft block physics collision |
| 13 | Suicide Invariant | **HIGH** | `EnemyEntities.ts:346` | Bomber ignores other ticking bombs, walking into existing blast zones |
| 14 | Neutral NPC | **HIGH** | `NeutralEntities.ts:95` | Merchant passes `bombTiles` instead of blast tiles, never fleeing bombs |
| 15 | PetDrone Ally | **MEDIUM** | `AllyEntities.ts:214` | Fixed `2.5 px/frame` tractor beam lacks delta scaling (FPS dependent) |
| 16 | Items / Magnet | **MEDIUM** | `GameScene.ts:3152` | Infinite bobbing tween overwrites item Y coordinate during vacuum |
| 17 | ShieldGuard Ally | **MEDIUM** | `AllyEntities.ts:343` | Taunt aura is cosmetic; enemy AI hardcodes player tracking |
| 18 | ShieldGuard Ally | **MEDIUM** | `AllyEntities.ts:392` | Unchecked `takeDamage` return allows free absorption during i-frames |
| 19 | Allies / Collision | **LOW** | `GameScene.ts:1271` | Pet Drone takes ground melee damage from enemies while flying |

---

## 7. Recommended Remediation Order
1. **P0 (Game Breaking)**:
   - Fix Queen Bee Boss grounding triggers and Hamster Boss boundary checks so bosses can be fought and defeated.
   - Add timeout watchdog and `onBombExploded` method to `BomberEnemy` to prevent permanent evasion softlocks.
   - Fix `GhostEnemy` Ether Dash to prevent path-following override on frame 2.
2. **P1 (Stability & Invariants)**:
   - Fix `MerchantNPC` flee logic to pass cumulative blast tiles instead of `bombTiles`.
   - Add coordinate bounds check to `isTileInBlastRange`.
   - Align `ZeroGCPathfinder.init` parameter order with constructor.
   - Resolve `ChaserEnemy` double-stun timer conflict.
3. **P2 (Quality & Polish)**:
   - Add delta scaling to `PetDroneAlly` tractor beam and cancel item tweens on attraction.
   - Validate adjacent tiles before spawning `MiniSplitterEnemy` slimes.
   - Wire enemy aggro redirection into `ShieldGuardAlly` taunt.
