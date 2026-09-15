# Handoff Report: Milestone 1 — Directional Character Animations & Spritesheet

**Agent**: worker_mech_anim  
**Date**: 2026-09-15  
**Working Directory**: `/Users/user/src/bomberman/.agents/worker_mech_anim`  
**Target Milestone**: Milestone 1 (Directional Character Animations & Spritesheet)  
**Status**: Hard Handoff (Completed)

---

## 1. Observation

### 1.1 Pre-Modification Baseline
- `public/assets/player.png` previously had dimensions `40x40` pixels, containing only a single static front-facing image.
- `scripts/generate-assets.sh` lines 12–55 contained a 40x40 single-frame SVG, and lines 296–304 ran:
  ```bash
  sips -s format png -z 40 40 "$svg" --out "$TARGET_DIR/${name}.png"
  ```
- `src/game/GameScene.ts` line 654 loaded `player` as a static image:
  ```typescript
  this.load.image('player', '/assets/player.png');
  ```
- In `src/game/GameScene.ts` (`updatePlayerMovement()`), line 853 only called `this.player.setVelocity(0, 0)` with no animation controls or idle frame retention; vertical movement (lines 957–985) did not update sprite frames; and `playerDie()` (line 1215) only applied `this.player.setTint(0x000000)` without defeat animations.
- Test baseline: `npm test` passed 70/70 tests across 6 suites.

### 1.2 Asset Generation Execution & Verification
- Replaced the single-frame SVG in `scripts/generate-assets.sh` with the 120x160 12-frame SVG spritesheet template:
  - Row 0 (y = 0..40): Down walk cycle (frames 0, 1, 2)
  - Row 1 (y = 40..80): Up walk cycle (frames 3, 4, 5)
  - Row 2 (y = 80..120): Side/profile walk cycle (frames 6, 7, 8)
  - Row 3 (y = 120..160): Defeat & stun reaction (frames 9, 10, 11)
- Updated sips conversion logic in `scripts/generate-assets.sh`:
  ```bash
  elif [ "$name" = "player" ]; then
    sips -s format png -z 160 120 "$svg" --out "$TARGET_DIR/${name}.png" >/dev/null
  ```
- Executed `bash scripts/generate-assets.sh` and verified with `sips -g pixelWidth -g pixelHeight public/assets/player.png`:
  ```
  /Users/user/src/bomberman/public/assets/player.png
    pixelWidth: 120
    pixelHeight: 160
  ```

### 1.3 Code Implementation in `src/game/GameScene.ts`
1. Added persistent facing state:
   ```typescript
   private playerFacing: 'down' | 'up' | 'left' | 'right' = 'down';
   ```
2. Updated `preload()`:
   ```typescript
   this.load.spritesheet('player', '/assets/player.png', {
     frameWidth: 40,
     frameHeight: 40,
   });
   ```
3. In `create()`, registered 4 animations and set initial state:
   ```typescript
   this.playerFacing = 'down';
   this.anims.create({
     key: 'player_down',
     frames: this.anims.generateFrameNumbers('player', { frames: [0, 1, 0, 2] }),
     frameRate: 8,
     repeat: -1,
   });
   this.anims.create({
     key: 'player_up',
     frames: this.anims.generateFrameNumbers('player', { frames: [3, 4, 3, 5] }),
     frameRate: 8,
     repeat: -1,
   });
   this.anims.create({
     key: 'player_side',
     frames: this.anims.generateFrameNumbers('player', { frames: [6, 7, 6, 8] }),
     frameRate: 8,
     repeat: -1,
   });
   this.anims.create({
     key: 'player_defeat',
     frames: this.anims.generateFrameNumbers('player', { frames: [9, 10, 11] }),
     frameRate: 6,
     repeat: 0,
   });
   // ...
   this.player.setFrame(0);
   ```
4. In `updatePlayerMovement()`:
   - When input stops (`!left && !right && !up && !down`):
     ```typescript
     this.player.setVelocity(0, 0);
     this.player.anims.stop();
     switch (this.playerFacing) {
       case 'down':
         this.player.setFrame(0);
         break;
       case 'up':
         this.player.setFrame(3);
         break;
       case 'right':
         this.player.setFlipX(false);
         this.player.setFrame(6);
         break;
       case 'left':
         this.player.setFlipX(true);
         this.player.setFrame(6);
         break;
     }
     return;
     ```
   - When moving on X-axis:
     ```typescript
     vx = wantX * speed;
     this.player.setFlipX(wantX < 0);
     this.playerFacing = wantX < 0 ? 'left' : 'right';
     this.player.anims.play('player_side', true);
     ```
   - When moving on Y-axis:
     ```typescript
     vy = wantY * speed;
     this.playerFacing = wantY < 0 ? 'up' : 'down';
     this.player.anims.play(wantY < 0 ? 'player_up' : 'player_down', true);
     ```
   - Preserved `this.player.setFlipX(true)` and `this.player.setFlipX(false)` in corner rounding logic.
5. In `playerDie()`:
   ```typescript
   this.player.setVelocity(0, 0);
   this.player.anims.play('player_defeat');
   this.physics.pause();
   this.time.delayedCall(1000, () => {
     this.isGameOver = false;
     this.activeBombs = 0;
     this.playerFacing = 'down';
     this.scene.restart();
   });
   ```

### 1.4 Test Suite & Build Output
- Created `tests/directional_animations.test.mjs` containing 7 tests verifying:
  - Spritesheet PNG file existence, valid PNG signature, and exact 120x160 IHDR dimensions.
  - DOWN movement controller transitions and idle frame 0 preservation.
  - UP movement controller transitions and idle frame 3 preservation.
  - RIGHT movement controller transitions, flipX=false, and idle frame 6 preservation.
  - LEFT movement controller transitions, flipX=true, and idle frame 6 preservation.
  - Defeat animation trigger and execution.
  - Hitbox geometric symmetry invariant (8px margins on all 4 sides within 40x40 frame).
- Executed `npm test`:
  ```
  ℹ tests 77
  ℹ suites 0
  ℹ pass 77
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 88.761041
  ```
- Executed `npm run lint`:
  ```
  > eslint
  (Exited with code 0, 0 warnings, 0 errors)
  ```
- Executed `npm run build`:
  ```
  ▲ Next.js 16.3.5 (Turbopack)
  ✓ Compiled successfully in 302ms
  Running TypeScript ...
  Finished TypeScript in 736ms ...
  ✓ Generating static pages using 5 workers (4/4) in 214ms
  Finalizing page optimization ...
  (Exited with code 0)
  ```

---

## 2. Logic Chain

1. **Spritesheet Sizing & Alignment**:
   - The game uses `40x40` tile grids and player dimensions. By arranging 3 columns and 4 rows of 40x40 frames into a 120x160 spritesheet, Phaser's `load.spritesheet` cuts each frame at exact integer pixel offsets without bleed or scaling artifacts.
2. **Animation Frame Sequences**:
   - Walk cycles follow classic top-down 4-step sequence `[0, 1, 0, 2]` repeating infinitely (`repeat: -1`).
   - Frame rate `8` at speed `150 px/s` matches footstep frequency to world translation.
   - `ignoreIfPlaying: true` prevents animation reset on every frame update tick, ensuring continuous stride animations while keys are held.
3. **Facing Memory & Idle Retention**:
   - `playerFacing` tracks the active direction during movement. When input is released, `this.player.anims.stop()` stops the walk loop and displays the neutral standing stance matching `playerFacing`.
   - Side profile utilizes horizontal mirroring (`flipX`), which maintains identical physics collision bounds because the 24x24 body is symmetrically positioned with `(8, 8)` offset inside the 40x40 boundary (`(40 - 24) / 2 = 8`).
4. **Compatibility Invariance**:
   - Preserving `flipX` behavior in corner rounding ensures all 32 corridor-centering and corner-sliding unit tests pass without regression.

---

## 3. Caveats

- **Enemy Sprites**: Enemy sprites currently continue to use procedural tween animations in `Enemy.ts` as designed in prior iterations. Only player sprites use the spritesheet animation system in Milestone 1.
- **Defeat Timing**: The defeat animation runs for 500ms (3 frames at 6 fps = 500ms) within the 1000ms delay call before scene restart, ensuring the player clearly sees the dizzy reaction before the map resets.

---

## 4. Conclusion

Milestone 1 (Directional Character Animations & Spritesheet) is **100% complete and verified**:
- Procedural asset generation in `scripts/generate-assets.sh` produces a valid 120x160 12-frame spritesheet at `public/assets/player.png`.
- `GameScene.ts` cleanly handles spritesheet loading, animation creation, directional walk cycles, idle facing memory, and defeat animations.
- All 77 tests (70 regression + 7 new) pass cleanly.
- Production build (`npm run build`) and linter (`npm run lint`) pass with exit code 0.

---

## 5. Verification Method

To independently verify this milestone:

1. **Verify Asset Dimensions**:
   ```bash
   bash scripts/generate-assets.sh
   sips -g pixelWidth -g pixelHeight public/assets/player.png
   ```
   *Expected output*: `pixelWidth: 120`, `pixelHeight: 160`.

2. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   *Expected output*: All 77 tests pass with 0 failures.

3. **Run Production Build**:
   ```bash
   npm run build
   ```
   *Expected output*: Turbopack compiles successfully, TypeScript check passes, exit code 0.

4. **Run Linter**:
   ```bash
   npm run lint
   ```
   *Expected output*: ESLint completes with 0 errors.

**Invalidation Conditions**:
- Any regression in test count or pass rate (< 77 passing).
- Modification of player hitbox offset from `(8, 8)` or size from `(24, 24)`.
- Reversion of `player.png` dimensions away from 120x160.
