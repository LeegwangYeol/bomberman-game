# Scene Mechanics, UI & Graphics Remediation Handoff Report

## 1. Observation
1. **PHYS-REV-02 (Explosion Invariant Guard)**:
   - In `src/game/GameScene.ts` at line ~3013, explosions were created and sized with `setSize(36, 36).setOffset(2, 2)`. However, the 1.35x visual bloom tween at lines 3036-3045 dynamically modulated `scaleX` and `scaleY`. Without `applyPhysicsBodyInvariantGuard`, Arcade Physics body size dynamically scales with game object transform (`body.width = width * scaleX`), ballooning the physical hitbox from 36x36 to 48.6px and penetrating corner pillars.
2. **PHYS-REV-03 (Bomb Invariant Guard)**:
   - In `src/game/GameScene.ts` in `placeBomb` and `placeEnemyBomb`, bombs were sized with `setSize(32, 32).setOffset(4, 4)`. Multi-stage 4-phase pulsing scaled the bomb up to 1.32x (Phase 3), which without `applyPhysicsBodyInvariantGuard` ballooned the physical hitbox to 42.24px and snagged entities in adjacent lanes.
3. **PHYS-REV-04, 05, 06 & Gimmick Fixes**:
   - In `src/game/GameScene.ts` line ~1865 (`conveyor drift`), bombs drifted along conveyor belts without checking whether the destination cell `(leadRow, leadCol)` already contained an active bomb, resulting in bomb stacking.
   - In `GameScene.ts` line ~1022, sliding kicked bombs colliding with allies or neutrals lacked graceful overlap handling, causing physics jitter.
   - In `warpPlayer` (line ~3788), player teleportation did not reset the physics body (`player.body?.reset(targetX, targetY)`) and did not register destination portal bombs in `ignoringColliders`, causing forceful ejection.
4. **UI-STAGGER-01, UI-PAUSE-01, UI-BUBBLE-01**:
   - In `OverheadUIManager` in `src/game/GameScene.ts`, overhead label vertical offsets (`offsetsY`) were unclamped, causing off-screen rendering at screen boundaries. Staggering overwrote vertical clusters with flat offsets.
   - In `triggerHitStop`, `shutdown()`, and `create()`, `isHitStopActive` was not cleared and paused physics worlds were not resumed on transition or restart.
   - Player protection bubble alpha dropped abruptly at 38px instead of smoothly interpolating across 20px-38px and 38px-50px.
5. **ARCH-PERK-01, ARCH-RELIC-01, ARCH-PERSIST-01, AI-BOSS-01**:
   - `playerDie()` did not check `this.perkManager?.triggerSecondWind()`, allowing lethal damage to immediately restart the scene even when Second Wind was unlocked.
   - `RelicManager` was not instantiated in `GameScene.create()`, not updated in `GameScene.update()`, and did not trigger procs on bomb placement, explosion, or enemy kills.
   - Boss entities did not apply contact damage to players on collision and did not check for bomb/crater collision stuns.
   - `onResumeRunState` did not deserialize and restore map/blocks, player stats, items, and score.
6. **UI-DEPTH-01**:
   - In `src/game/ultimate_skills.ts`, Chrono Stasis overlay was hardcoded to depth 30/31 instead of `RENDER_DEPTH.SCREEN_OVERLAY` (950), Super Nova shockwave was hardcoded to depth 25 instead of `RENDER_DEPTH.SHOCKWAVES` (760), and Meteor Streak was hardcoded to 22-24 instead of `RENDER_DEPTH.EXPLOSIONS + 5` (755).
7. **PHYS-REV-08 & SEC-UI-01/02**:
   - In `src/components/BombermanGame.tsx`, Arcade Physics world bounds were not configured to match the 600x520 arena dimensions. Background movement keys continued mutating `mobileInput` when modal dialogs were open, without Escape dismissal or sticky key state clearing.

## 2. Logic Chain
1. **PHYS-REV-02 Fix**:
   - Defined `public createExplosionSprite(x: number, y: number, owner: string = 'player'): Phaser.Physics.Arcade.Sprite` in `src/game/GameScene.ts` which calls `applyPhysicsBodyInvariantGuard(exp, 36, 36, 2, 2)`.
   - Replaced all explosion instantiations (`spawnExplosion` and `executeNuclearBarrage`) to route through `createExplosionSprite`.
   - Verified that `updateFromGameObject()` preserves `width === 36, height === 36, halfWidth === 18, halfHeight === 18` even when `scaleX = 1.35, scaleY = 1.35`.
2. **PHYS-REV-03 Fix**:
   - Added `applyPhysicsBodyInvariantGuard(bomb, 32, 32, 4, 4)` in both `placeBomb` and `placeEnemyBomb` in `src/game/GameScene.ts`.
   - Verified that 4-phase pulsing up to 1.32x leaves `width === 32, height === 32, halfWidth === 16, halfHeight === 16` invariant.
3. **Gimmicks & Conveyor Fixes**:
   - Added `bombBlocking` check in conveyor drift: `(leadRow !== bRow || leadCol !== bCol) && this.bombs.getChildren().some(...)`, ensuring drift is halted if target cell has an active bomb.
   - Added physics overlap handlers between `bombs` and `allies`/`neutrals` for sliding kicked bombs to zero velocity and snap to tile center smoothly.
   - Updated `warpPlayer` to call `this.player.body?.reset(targetX, targetY)` and register destination bombs into `ignoringColliders` bidirectionally.
4. **UI Fixes**:
   - Clamped `offsetsY` in `OverheadUIManager` to `[20, 500]` using `Math.max(20, Math.min(500, labelY))`.
   - Implemented 3-way directional staggering for vertical entity clusters.
   - Added `smoothOuterBubble: boolean = false` with optional constructor param (`true` in `GameScene`), smoothly interpolating alpha across `[20, 38]` and `[38, 50]`.
   - Added `isHitStopActive = false` and `if (this.physics?.world?.isPaused) this.physics.world.resume()` to `shutdown()`, `create()`, and `triggerHitStop`.
5. **Progression & Boss Interactivity**:
   - In `playerDie()`, inserted `this.relicManager?.onPlayerDamaged()` and `if (this.perkManager?.triggerSecondWind()) { ... return; }`, granting 3.0s invulnerability, golden shield VFX burst, and restoring 1 HP/shield charge.
   - Instantiated `this.relicManager = new RelicManager()` in `create()`, wired `onRelicsUpdated`, invoked `relicManager.update()` in `update()`, `relicManager.onBombPlaced()` in `placeBomb()`, `relicManager.onBombExploded()` in `explodeBomb()`, and `relicManager.onEnemyKilled()` on enemy defeats.
   - Implemented board decompression (`decompressGrid`), player stats, active items, and score restoration in `onResumeRunState`.
   - Added boss collision distance check in `update()` to damage player on contact unless invulnerable/stunned/aegis, and check bomb proximity to apply bomb damage + 2.5s stun.
6. **VFX Depths**:
   - In `src/game/ultimate_skills.ts`, imported `RENDER_DEPTH` and updated Chrono Stasis overlay and border to `RENDER_DEPTH.SCREEN_OVERLAY` (950), Super Nova shockwave to `RENDER_DEPTH.SHOCKWAVES` (760), and Meteor streak/embers to `RENDER_DEPTH.EXPLOSIONS + 5` (755).
7. **Modal Input & Physics Bounds**:
   - In `src/components/BombermanGame.tsx`, set Arcade physics bounds `{ x: 0, y: 0, width: 600, height: 520 }`.
   - Added `isPauseModalOpen`, `isAnyModalOpenRef`, and `resetInputState()`.
   - Added Escape key handler to close open modals or toggle pause modal.
   - Suppressed key processing in `handleKeyDown` and `handleKeyUp` while any modal is open.
   - Rendered Pause modal dialog with "Resume Game" button.

## 3. Caveats
- `src/game/crises/CrisisManager.ts` is owned by a concurrent worker. TypeScript build failure in Next.js was isolated to missing methods on `ICrisis` in `CrisisManager.ts` (`resolveCrisis`, `failCrisis`), and our owned files (`GameScene.ts`, `ultimate_skills.ts`, `BombermanGame.tsx`) type-check with 0 errors.

## 4. Conclusion
All 8 assigned remediation tasks for Scene Mechanics, UI & Graphics have been implemented and defensively verified. All 673 unit tests pass, and ESLint produces 0 errors.

## 5. Verification Method
1. Run the new defensive test suite:
   ```bash
   node --experimental-strip-types --test tests/scene_ui_defensive.test.mjs
   ```
   *Expected result: 11 tests passing, 0 failures.*
2. Run the entire test suite:
   ```bash
   npm test
   ```
   *Expected result: 673 tests passing, 0 failures.*
3. Run project linter:
   ```bash
   npm run lint
   ```
   *Expected result: 0 errors.*
