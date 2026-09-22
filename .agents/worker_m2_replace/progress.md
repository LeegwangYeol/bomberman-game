# Progress — Worker M2 Replacement

## Current Status: Milestone 2 Complete (Ready for Handoff)
Last visited: 2026-09-22T09:56:00Z

## Completed Items
1. **Unified 2.5D Depth Hierarchy (`RENDER_DEPTH`)**:
   - Ground layers (-10 to 9), dynamic entity band (100 + y*1.0 with sub-offsets for shadow, sprite, shield, hp bar, name tag, intent badge), VFX layers (750 to 770), Boss layers (800 to 810), and UI layers (900 to 950).
   - Dynamic continuous Y-sorting across all entities, allies, neutrals, and player.
2. **Centralized `OverheadUIManager`**:
   - AABB collision detection and horizontal spring repulsion (`dx < requiredW && dy < requiredH`).
   - Vertical staggering (`offsetsY = -14` / `+46` px) when tightly stacked horizontally (`dx < 24px`).
   - Strict arena boundary clamping (`[20, 580]`).
   - Adaptive LOD:
     - Solo (`dist > 70px`): Full name.
     - Clustered (`dist <= 70px`): Compact nickname.
     - Dense melee (`3+ entities <= 60px`): Minimal (hide text, show HP/intent only).
3. **Player Sprite Protection Bubble**:
   - Radius $R = 38\text{px}$.
   - For entity labels within $R \le 20\text{px}$, opacity drops to $0.0$.
   - For entity labels between $20\text{px} < d \le 38\text{px}$, smooth linear decay to $\le 0.15$.
   - Frame-over-frame lerp provides smooth alpha decay without popping.
4. **Staggered Floating Text Queue**:
   - `FloatingTextManager` tracks recent pickup events within $450\text{ms}$ and $30\text{px}$.
   - Accumulates vertical cascade offset ($+16\text{px}$ per recent pickup).
   - Expired pickups automatically pruned.
5. **Duck-Typed Bomb/Hazard Masks**:
   - `isTileInHazardMask` and `cloneBombTilesAsSet` unify `Set<string>`, `Uint8Array`, and `FlatHazardMask`.
   - Updated `pathfinding.ts` and all 6 enemy archetypes in `EnemyEntities.ts`.
6. **Bomb Overlap Clearance**:
   - `populateBombIgnoringColliders` checks creator, player, enemies, allies, and neutrals to prevent corner snagging or trapping.
7. **Headless `OverheadUI` Test Invariant**:
   - `getRenderLayers(includeOffsets = false)` retains standard reference offsets (`-14`, `-22`, `-34`) so existing unit tests pass without breakage.
8. **Comprehensive Test Suite (`tests/ui_depth_declutter.test.mjs`)**:
   - 22 tests verifying all 8 tiers, passing with 0 failures in under 250ms.
9. **Full Project Verification**:
   - `npm test`: 584 passed, 0 failed.
   - `npm run lint`: 0 errors.
   - `npm run build`: Exit code 0, clean Turbopack production build.
