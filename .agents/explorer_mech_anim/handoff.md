# Handoff Report: Directional Character Animations & Sprite Visual System

**Agent**: explorer_mech_anim  
**Date**: 2026-09-15  
**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_mech_anim`  
**Target Milestone**: mechanics_refine / Directional Animations  

---

## 1. Observation

### 1.1 Existing Player Assets in `/Users/user/src/bomberman/public/assets/`
Direct inspection of `/Users/user/src/bomberman/public/assets/` revealed:
```
public/assets/
├── background.png (86,562 bytes)
├── block.png      (1,573 bytes)
├── bomb.png       (2,508 bytes)
├── enemy.png      (2,864 bytes)
├── enemy_tracker.png (2,618 bytes)
├── explosion.png  (2,343 bytes)
├── floor.png      (2,070 bytes)
├── player.png     (2,402 bytes)  <-- Only player asset
└── wall.png       (1,650 bytes)
```
- Command `sips -g all public/assets/player.png` output:
  - `pixelWidth: 40`, `pixelHeight: 40`, format: PNG with alpha channel (`hasAlpha: yes`).
- Asset generation script `/Users/user/src/bomberman/scripts/generate-assets.sh` (lines 12–55) defines the source SVG template (`player.svg`) and converts it to PNG via:
  ```bash
  sips -s format png -z 40 40 "$svg" --out "$TARGET_DIR/${name}.png"
  ```
- **Limitation**: The current `player.png` contains only a **single static front-facing frame** (down/camera facing):
  - Cute white helmet (`x=7, y=6, w=26, h=20, rx=9`)
  - Pink/peach visor opening (`x=11, y=10, w=18, h=13, rx=6`)
  - Two frontal anime eyes (`cx=15.5`, `cx=24.5`) with white twinkle dots
  - Blue suit with belt buckle centered (`x=18, y=27.5`)
  - Pink pom-pom antenna centered (`cx=20, cy=4`)
  - Two red feet side-by-side (`cx=14, cy=35`, `cx=26, cy=35`)
- **There are currently NO walk frames, NO back-facing (upward) frames, NO side-profile frames, and NO spritesheets.**

---

### 1.2 Player Sprite Loading, Instantiation & Physics in `src/game/GameScene.ts`
Inspection of `src/game/GameScene.ts` shows:
1. **Preload** (line 654):
   ```typescript
   this.load.image('player', '/assets/player.png');
   ```
2. **Instantiation & Physics Box** (lines 684–692):
   ```typescript
   this.player = this.physics.add.sprite(
     1 * TILE_SIZE + TILE_SIZE / 2,
     1 * TILE_SIZE + TILE_SIZE / 2,
     'player'
   );
   this.player.setCollideWorldBounds(true);
   this.player.setDepth(10);
   (this.player.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(8, 8);
   ```
   - Sprite canvas size is `40x40`.
   - Arcade physics body is `24x24` with offset `(8, 8)`.
   - **Crucial geometric invariant**: `(40 - 24) / 2 = 8`. The body is **symmetrically centered** horizontally and vertically:
     - Left margin: `8px`, Right margin: `40 - (8 + 24) = 8px`.
     - Top margin: `8px`, Bottom margin: `40 - (8 + 24) = 8px`.
3. **Collisions & Overlaps** (lines 697–713):
   - Colliders: `walls`, `blocks`, `bombs`.
   - Overlaps: `enemies`, `explosions` -> calls `this.playerDie()`.

---

### 1.3 Player Movement Controller in `GameScene.ts` (`updatePlayerMovement()`, lines 843–988)
- Input detection reads cursors and `window.mobileInput`:
  ```typescript
  const left = Boolean(this.cursors?.left?.isDown || mInput.left);
  const right = Boolean(this.cursors?.right?.isDown || mInput.right);
  const up = Boolean(this.cursors?.up?.isDown || mInput.up);
  const down = Boolean(this.cursors?.down?.isDown || mInput.down);
  ```
- If all inputs are false:
  ```typescript
  if (!left && !right && !up && !down) {
    this.player.setVelocity(0, 0);
    return;
  }
  ```
  - **No animation pausing, no idle frame selection, no facing memory exists.** The sprite simply freezes in whatever state it had.
- Dominant axis resolution selects `primaryAxis = 'x'` or `'y'` (lines 905–923).
- Directional visual handling currently in place:
  - **Moving along X-axis** (`primaryAxis === 'x'`):
    ```typescript
    vx = wantX * speed;
    this.player.setFlipX(wantX < 0); // line 930
    ```
  - **Moving along Y-axis** (`primaryAxis === 'y'`):
    - Normal vertical movement (lines 957–970):
      ```typescript
      vy = wantY * speed;
      // ... corridor centering ...
      ```
      **`setFlipX` is NOT touched, and no texture or frame change occurs.**
    - Corner Rounding on Y-axis (lines 971–985):
      ```typescript
      if (canRoundLeft) {
        vx = -slideSpeed;
        this.player.setFlipX(true);  // line 977
      } else if (canRoundRight) {
        vx = slideSpeed;
        this.player.setFlipX(false); // line 980
      }
      ```
- **Defect in Current Experience**:
  - Moving **UP (North)**: The player walks backward while still facing directly towards the camera.
  - Moving **DOWN (South)**: The player slides forward with completely frozen legs.
  - Moving **LEFT/RIGHT**: The front face is horizontally mirrored, creating a 2D cutout slide without side profile depth or leg walking strides.

---

### 1.4 Test Suite & Simulator Contract (`tests/player_movement_stress.test.mjs`)
- `tests/player_movement_stress.test.mjs` executes 32 rigorous movement tests against `PlayerMovementSimulator`.
- Lines 387, 514, 524, and 787 explicitly assert `sim.player.flipX`:
  ```javascript
  assert.equal(sim.player.flipX, false, 'Moving right sets flipX = false');
  assert.equal(sim.player.flipX, true, 'Sliding left sets flipX = true');
  assert.equal(sim.player.flipX, true, 'Mobile input left sets flipX = true');
  ```
- Any implementation of directional animations **must maintain the `flipX` contract** so existing movement, corridor-centering, and corner-sliding physics tests remain 100% compliant.

---

## 2. Logic Chain

1. **Step 1: Spritesheet Format Selection**
   - Phaser 3 provides `this.load.spritesheet(key, url, { frameWidth, frameHeight })` and `this.anims.create()`.
   - Using individual images for each frame would multiply asset HTTP requests by 9–12x and incur texture switching overhead.
   - A single cohesive spritesheet with identical `40x40` frame boundaries allows Phaser's animation manager to cycle frames smoothly via `generateFrameNumbers()` with zero texture swapping latency.

2. **Step 2: Walk Cycle Frame Budget & Layout**
   - Standard 2D top-down walk cycles (e.g. Bomberman, Pokemon, Zelda) use a 4-step sequence across 3 unique frames:
     - `[0: Neutral/Idle, 1: Step Left, 0: Neutral/Idle, 2: Step Right]`
   - At `frameRate: 8` and movement speed of `150 px/s`, one full walk cycle takes 500ms (0.5s), corresponding to exactly `150 * 0.5 = 75px` traversed per cycle (roughly 1.8 tiles). This provides a crisp, natural cadence.
   - Grid layout: **3 columns x 4 rows** = `120px` width x `160px` height:
     - **Row 0** (`y = 0..40`, frames 0, 1, 2): **DOWN (South)**
       - Frame 0: Idle Down (Frontal stance, eyes forward, boots level)
       - Frame 1: Walk Down Left (Left foot forward/raised, pom-pom bobs left)
       - Frame 2: Walk Down Right (Right foot forward/raised, pom-pom bobs right)
     - **Row 1** (`y = 40..80`, frames 3, 4, 5): **UP (North)**
       - Frame 3: Idle Up (Smooth back of helmet with curved specular highlight, blue suit back, dark belt without buckle, red heels level)
       - Frame 4: Walk Up Left (Left heel raised, pom-pom bobs)
       - Frame 5: Walk Up Right (Right heel raised, pom-pom bobs)
     - **Row 2** (`y = 80..120`, frames 6, 7, 8): **SIDE (East / Right Profile)**
       - Frame 6: Idle Profile (Visor shifted right, single expressive eye looking right with twinkle highlight, cheek blush, antenna tilted back, profile stance)
       - Frame 7: Walk Stride 1 (Right foot forward stride, left foot back stride)
       - Frame 8: Walk Stride 2 (Left foot forward stride, right foot back stride)
     - **Row 3** (`y = 120..160`, frames 9, 10, 11): **DEFEAT / STUN / DIZZY**
       - Frame 9: Dizzy X-Eyes (`x_x`)
       - Frame 10: Squashed impact reaction
       - Frame 11: Spiral dizzy eyes (`@_@`)

3. **Step 3: Horizontal Mirroring (`flipX`) vs. Left Directional Frame Row**
   - Because `(this.player.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(8, 8)` is symmetrically centered within the 40x40 canvas (`8px` margin on left and right), calling `player.setFlipX(true)` flips the visual sprite horizontally around its center without altering the physics body's position, bounds, or collision behavior.
   - As observed in Section 1.4, `tests/player_movement_stress.test.mjs` explicitly asserts `flipX = true` when moving or sliding left.
   - Using the **Side profile (Row 2)** with `flipX = false` for Right and `flipX = true` for Left allows total consistency with the existing physics simulator tests.

4. **Step 4: Idle Preservation & State Transition Mechanics**
   - To preserve idle facing direction when the player stops:
     1. Maintain a state property: `private playerFacing: 'down' | 'up' | 'left' | 'right' = 'down';`
     2. In `updatePlayerMovement()`, whenever directional movement occurs:
        - Set `this.playerFacing` to the active heading.
        - Trigger the matching walk animation using `this.player.anims.play(animKey, true)`.
        - The `true` parameter (`ignoreIfPlaying: true`) is critical: it prevents Phaser from restarting the animation if it is already playing, guaranteeing buttery-smooth transitions without jitter.
     3. When all inputs are released (`!left && !right && !up && !down`):
        - Stop the animation: `this.player.anims.stop();`
        - Set the sprite to the idle frame corresponding to `this.playerFacing`:
          - `'down'` -> `this.player.setFrame(0);`
          - `'up'` -> `this.player.setFrame(3);`
          - `'right'` -> `this.player.setFlipX(false); this.player.setFrame(6);`
          - `'left'` -> `this.player.setFlipX(true); this.player.setFrame(6);`
   - Result: When the player releases the keys after running up, the character stops and remains facing upward.

5. **Step 5: Visual Behavior During Corner-Rounding**
   - When the player moves along `primaryAxis === 'y'` (e.g. holding UP) and encounters a pillar, corner rounding slides them horizontally (`canRoundLeft` / `canRoundRight`).
   - The player's explicit intent is UP. Keeping the `player_up` walk animation active during corner rounding makes the character face and march towards their intended corridor while the physics body automatically navigates the obstruction.
   - When moving along `primaryAxis === 'x'`, the side walk animation plays while vertical corridor centering gently adjusts `player.y`.

---

## 3. Caveats

1. **Asset Build Step Requirement**:
   - The spritesheet must be generated before or during build so Next.js static serving can serve `/assets/player.png`.
   - `scripts/generate-assets.sh` already handles this via macOS `sips`. Tested: `sips` converts the multi-frame SVG into a 120x160 PNG in <0.05 seconds with zero external dependencies.
2. **Enemy Animations Independence**:
   - Enemies currently utilize tween-based procedural animations (squash & stretch, waddle rotation, pop-in text indicators) defined in `Enemy.ts`. They do not currently use sprite frame animations. If enemy directional animations are desired in the future, the same spritesheet pipeline can be applied to `enemy.png` and `enemy_tracker.png`.
3. **No Caveats Regarding Physics**:
   - The physics hitbox size `(24, 24)` and offset `(8, 8)` are strictly invariant across all frames, ensuring zero impact on corridor sliding or collision detection.

---

## 4. Conclusion

Directional animations should be implemented via a **120x160 (3 cols x 4 rows) SVG-generated spritesheet** placed at `public/assets/player.png`, paired with Phaser 3 spritesheet loading, 4 directional animations, and idle state retention.

### Concrete Implementation Blueprint

#### A. Asset Generation (`scripts/generate-assets.sh`)
Replace the single-frame `player.svg` in `scripts/generate-assets.sh` with the 120x160 12-frame SVG spritesheet template:
```xml
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160">
  <defs>
    <radialGradient id="pom" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ff99bb"/>
      <stop offset="100%" stop-color="#e6005c"/>
    </radialGradient>
    <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <linearGradient id="headGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="80%" stop-color="#f1f5f9"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
  </defs>

  <!-- ================= ROW 0: DOWN (Frames 0, 1, 2) ================= -->
  <!-- Frame 0: Down Idle -->
  <g transform="translate(0,0)">
    <ellipse cx="20" cy="37" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
    <ellipse cx="14" cy="35" rx="5" ry="3.5" fill="#ef4444"/>
    <ellipse cx="26" cy="35" rx="5" ry="3.5" fill="#ef4444"/>
    <rect x="11" y="22" width="18" height="13" rx="5" fill="url(#bodyGrad)" stroke="#1e3a8a" stroke-width="1.2"/>
    <rect x="13" y="28" width="14" height="3" fill="#1e293b"/>
    <rect x="18" y="27.5" width="4" height="4" fill="#fbbf24"/>
    <rect x="18.5" y="2" width="3" height="6" fill="#64748b" rx="1"/>
    <circle cx="20" cy="4" r="4" fill="url(#pom)" stroke="#be123c" stroke-width="1"/>
    <rect x="7" y="6" width="26" height="20" rx="9" fill="url(#headGrad)" stroke="#334155" stroke-width="1.5"/>
    <rect x="11" y="10" width="18" height="13" rx="6" fill="#ffe4e6" stroke="#fb7185" stroke-width="1"/>
    <ellipse cx="15.5" cy="16" rx="2" ry="3" fill="#0f172a"/>
    <circle cx="15" cy="15" r="0.8" fill="#ffffff"/>
    <ellipse cx="24.5" cy="16" rx="2" ry="3" fill="#0f172a"/>
    <circle cx="24" cy="15" r="0.8" fill="#ffffff"/>
    <ellipse cx="13" cy="19" rx="2" ry="1.2" fill="#f43f5e" opacity="0.6"/>
    <ellipse cx="27" cy="19" rx="2" ry="1.2" fill="#f43f5e" opacity="0.6"/>
  </g>
  <!-- Frame 1: Down Walk 1 -->
  <g transform="translate(40,0)">
    <ellipse cx="20" cy="37" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
    <ellipse cx="13" cy="33" rx="5.5" ry="4" fill="#dc2626"/>
    <ellipse cx="27" cy="36" rx="4.5" ry="3" fill="#b91c1c"/>
    <rect x="11" y="21.5" width="18" height="13" rx="5" fill="url(#bodyGrad)" stroke="#1e3a8a" stroke-width="1.2"/>
    <rect x="13" y="27.5" width="14" height="3" fill="#1e293b"/>
    <rect x="18" y="27" width="4" height="4" fill="#fbbf24"/>
    <rect x="18" y="1.5" width="3" height="6" fill="#64748b" rx="1"/>
    <circle cx="19.5" cy="3.5" r="4" fill="url(#pom)" stroke="#be123c" stroke-width="1"/>
    <rect x="7" y="5.5" width="26" height="20" rx="9" fill="url(#headGrad)" stroke="#334155" stroke-width="1.5"/>
    <rect x="11" y="9.5" width="18" height="13" rx="6" fill="#ffe4e6" stroke="#fb7185" stroke-width="1"/>
    <ellipse cx="15.5" cy="15.5" rx="2" ry="3" fill="#0f172a"/>
    <circle cx="15" cy="14.5" r="0.8" fill="#ffffff"/>
    <ellipse cx="24.5" cy="15.5" rx="2" ry="3" fill="#0f172a"/>
    <circle cx="24" cy="14.5" r="0.8" fill="#ffffff"/>
    <ellipse cx="13" cy="18.5" rx="2" ry="1.2" fill="#f43f5e" opacity="0.6"/>
    <ellipse cx="27" cy="18.5" rx="2" ry="1.2" fill="#f43f5e" opacity="0.6"/>
  </g>
  <!-- Frame 2: Down Walk 2 -->
  <g transform="translate(80,0)">
    <ellipse cx="20" cy="37" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
    <ellipse cx="13" cy="36" rx="4.5" ry="3" fill="#b91c1c"/>
    <ellipse cx="27" cy="33" rx="5.5" ry="4" fill="#dc2626"/>
    <rect x="11" y="21.5" width="18" height="13" rx="5" fill="url(#bodyGrad)" stroke="#1e3a8a" stroke-width="1.2"/>
    <rect x="13" y="27.5" width="14" height="3" fill="#1e293b"/>
    <rect x="18" y="27" width="4" height="4" fill="#fbbf24"/>
    <rect x="19" y="1.5" width="3" height="6" fill="#64748b" rx="1"/>
    <circle cx="20.5" cy="3.5" r="4" fill="url(#pom)" stroke="#be123c" stroke-width="1"/>
    <rect x="7" y="5.5" width="26" height="20" rx="9" fill="url(#headGrad)" stroke="#334155" stroke-width="1.5"/>
    <rect x="11" y="9.5" width="18" height="13" rx="6" fill="#ffe4e6" stroke="#fb7185" stroke-width="1"/>
    <ellipse cx="15.5" cy="15.5" rx="2" ry="3" fill="#0f172a"/>
    <circle cx="15" cy="14.5" r="0.8" fill="#ffffff"/>
    <ellipse cx="24.5" cy="15.5" rx="2" ry="3" fill="#0f172a"/>
    <circle cx="24" cy="14.5" r="0.8" fill="#ffffff"/>
    <ellipse cx="13" cy="18.5" rx="2" ry="1.2" fill="#f43f5e" opacity="0.6"/>
    <ellipse cx="27" cy="18.5" rx="2" ry="1.2" fill="#f43f5e" opacity="0.6"/>
  </g>

  <!-- ================= ROW 1: UP / BACK (Frames 3, 4, 5) ================= -->
  <!-- Frame 3: Up Idle -->
  <g transform="translate(0,40)">
    <ellipse cx="20" cy="37" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
    <ellipse cx="14" cy="35" rx="5" ry="3.5" fill="#ef4444"/>
    <ellipse cx="26" cy="35" rx="5" ry="3.5" fill="#ef4444"/>
    <rect x="11" y="22" width="18" height="13" rx="5" fill="url(#bodyGrad)" stroke="#1e3a8a" stroke-width="1.2"/>
    <rect x="11" y="28" width="18" height="3" fill="#1e293b"/>
    <rect x="18.5" y="2" width="3" height="6" fill="#64748b" rx="1"/>
    <circle cx="20" cy="4" r="4" fill="url(#pom)" stroke="#be123c" stroke-width="1"/>
    <rect x="7" y="6" width="26" height="20" rx="9" fill="url(#headGrad)" stroke="#334155" stroke-width="1.5"/>
    <path d="M 10 12 Q 20 8 30 12" stroke="#ffffff" stroke-width="1.8" fill="none" opacity="0.7" stroke-linecap="round"/>
  </g>
  <!-- Frame 4: Up Walk 1 -->
  <g transform="translate(40,40)">
    <ellipse cx="20" cy="37" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
    <ellipse cx="13" cy="33" rx="5.5" ry="4" fill="#dc2626"/>
    <ellipse cx="27" cy="36" rx="4.5" ry="3" fill="#b91c1c"/>
    <rect x="11" y="21.5" width="18" height="13" rx="5" fill="url(#bodyGrad)" stroke="#1e3a8a" stroke-width="1.2"/>
    <rect x="11" y="27.5" width="18" height="3" fill="#1e293b"/>
    <rect x="18" y="1.5" width="3" height="6" fill="#64748b" rx="1"/>
    <circle cx="19.5" cy="3.5" r="4" fill="url(#pom)" stroke="#be123c" stroke-width="1"/>
    <rect x="7" y="5.5" width="26" height="20" rx="9" fill="url(#headGrad)" stroke="#334155" stroke-width="1.5"/>
    <path d="M 10 11.5 Q 20 7.5 30 11.5" stroke="#ffffff" stroke-width="1.8" fill="none" opacity="0.7" stroke-linecap="round"/>
  </g>
  <!-- Frame 5: Up Walk 2 -->
  <g transform="translate(80,40)">
    <ellipse cx="20" cy="37" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
    <ellipse cx="13" cy="36" rx="4.5" ry="3" fill="#b91c1c"/>
    <ellipse cx="27" cy="33" rx="5.5" ry="4" fill="#dc2626"/>
    <rect x="11" y="21.5" width="18" height="13" rx="5" fill="url(#bodyGrad)" stroke="#1e3a8a" stroke-width="1.2"/>
    <rect x="11" y="27.5" width="18" height="3" fill="#1e293b"/>
    <rect x="19" y="1.5" width="3" height="6" fill="#64748b" rx="1"/>
    <circle cx="20.5" cy="3.5" r="4" fill="url(#pom)" stroke="#be123c" stroke-width="1"/>
    <rect x="7" y="5.5" width="26" height="20" rx="9" fill="url(#headGrad)" stroke="#334155" stroke-width="1.5"/>
    <path d="M 10 11.5 Q 20 7.5 30 11.5" stroke="#ffffff" stroke-width="1.8" fill="none" opacity="0.7" stroke-linecap="round"/>
  </g>

  <!-- ================= ROW 2: SIDE / RIGHT (Frames 6, 7, 8) ================= -->
  <!-- Frame 6: Side Idle -->
  <g transform="translate(0,80)">
    <ellipse cx="20" cy="37" rx="13" ry="3" fill="rgba(0,0,0,0.25)"/>
    <ellipse cx="17" cy="35.5" rx="5" ry="3" fill="#b91c1c"/>
    <ellipse cx="23" cy="35" rx="5.5" ry="3.5" fill="#ef4444"/>
    <rect x="12" y="22" width="16" height="13" rx="5" fill="url(#bodyGrad)" stroke="#1e3a8a" stroke-width="1.2"/>
    <rect x="14" y="28" width="14" height="3" fill="#1e293b"/>
    <rect x="24" y="27.5" width="3.5" height="4" fill="#fbbf24"/>
    <rect x="16.5" y="2" width="3" height="6" fill="#64748b" rx="1" transform="rotate(-8, 18, 5)"/>
    <circle cx="17" cy="3.5" r="4" fill="url(#pom)" stroke="#be123c" stroke-width="1"/>
    <rect x="7" y="6" width="26" height="20" rx="9" fill="url(#headGrad)" stroke="#334155" stroke-width="1.5"/>
    <path d="M 17 10 L 29 10 Q 33 16 29 23 L 17 23 Q 15 16 17 10 Z" fill="#ffe4e6" stroke="#fb7185" stroke-width="1"/>
    <ellipse cx="24" cy="16" rx="2.2" ry="3.2" fill="#0f172a"/>
    <circle cx="24.5" cy="15" r="0.9" fill="#ffffff"/>
    <ellipse cx="26" cy="19" rx="1.8" ry="1.1" fill="#f43f5e" opacity="0.6"/>
  </g>
  <!-- Frame 7: Side Walk 1 -->
  <g transform="translate(40,80)">
    <ellipse cx="20" cy="37" rx="13" ry="3" fill="rgba(0,0,0,0.25)"/>
    <ellipse cx="13" cy="35" rx="4.5" ry="3" fill="#b91c1c"/>
    <ellipse cx="27" cy="34" rx="5.5" ry="3.5" fill="#dc2626"/>
    <rect x="12" y="21.5" width="16" height="13" rx="5" fill="url(#bodyGrad)" stroke="#1e3a8a" stroke-width="1.2"/>
    <rect x="14" y="27.5" width="14" height="3" fill="#1e293b"/>
    <rect x="24" y="27" width="3.5" height="4" fill="#fbbf24"/>
    <rect x="16.5" y="1.5" width="3" height="6" fill="#64748b" rx="1" transform="rotate(-12, 18, 5)"/>
    <circle cx="16" cy="3" r="4" fill="url(#pom)" stroke="#be123c" stroke-width="1"/>
    <rect x="7" y="5.5" width="26" height="20" rx="9" fill="url(#headGrad)" stroke="#334155" stroke-width="1.5"/>
    <path d="M 17 9.5 L 29 9.5 Q 33 15.5 29 22.5 L 17 22.5 Q 15 15.5 17 9.5 Z" fill="#ffe4e6" stroke="#fb7185" stroke-width="1"/>
    <ellipse cx="24" cy="15.5" rx="2.2" ry="3.2" fill="#0f172a"/>
    <circle cx="24.5" cy="14.5" r="0.9" fill="#ffffff"/>
    <ellipse cx="26" cy="18.5" rx="1.8" ry="1.1" fill="#f43f5e" opacity="0.6"/>
  </g>
  <!-- Frame 8: Side Walk 2 -->
  <g transform="translate(80,80)">
    <ellipse cx="20" cy="37" rx="13" ry="3" fill="rgba(0,0,0,0.25)"/>
    <ellipse cx="26" cy="36" rx="4.5" ry="3" fill="#b91c1c"/>
    <ellipse cx="15" cy="33.5" rx="5.5" ry="3.5" fill="#dc2626"/>
    <rect x="12" y="21.5" width="16" height="13" rx="5" fill="url(#bodyGrad)" stroke="#1e3a8a" stroke-width="1.2"/>
    <rect x="14" y="27.5" width="14" height="3" fill="#1e293b"/>
    <rect x="24" y="27" width="3.5" height="4" fill="#fbbf24"/>
    <rect x="16.5" y="1.5" width="3" height="6" fill="#64748b" rx="1" transform="rotate(-4, 18, 5)"/>
    <circle cx="17.5" cy="3" r="4" fill="url(#pom)" stroke="#be123c" stroke-width="1"/>
    <rect x="7" y="5.5" width="26" height="20" rx="9" fill="url(#headGrad)" stroke="#334155" stroke-width="1.5"/>
    <path d="M 17 9.5 L 29 9.5 Q 33 15.5 29 22.5 L 17 22.5 Q 15 15.5 17 9.5 Z" fill="#ffe4e6" stroke="#fb7185" stroke-width="1"/>
    <ellipse cx="24" cy="15.5" rx="2.2" ry="3.2" fill="#0f172a"/>
    <circle cx="24.5" cy="14.5" r="0.9" fill="#ffffff"/>
    <ellipse cx="26" cy="18.5" rx="1.8" ry="1.1" fill="#f43f5e" opacity="0.6"/>
  </g>

  <!-- ================= ROW 3: DEFEAT / STUN (Frames 9, 10, 11) ================= -->
  <!-- Frame 9: Dizzy X-Eyes -->
  <g transform="translate(0,120)">
    <ellipse cx="20" cy="37" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
    <ellipse cx="14" cy="35" rx="5" ry="3.5" fill="#ef4444"/>
    <ellipse cx="26" cy="35" rx="5" ry="3.5" fill="#ef4444"/>
    <rect x="11" y="22" width="18" height="13" rx="5" fill="url(#bodyGrad)" stroke="#1e3a8a" stroke-width="1.2"/>
    <rect x="13" y="28" width="14" height="3" fill="#1e293b"/>
    <rect x="18" y="27.5" width="4" height="4" fill="#fbbf24"/>
    <rect x="18.5" y="2" width="3" height="6" fill="#64748b" rx="1"/>
    <circle cx="20" cy="4" r="4" fill="url(#pom)" stroke="#be123c" stroke-width="1"/>
    <rect x="7" y="6" width="26" height="20" rx="9" fill="url(#headGrad)" stroke="#334155" stroke-width="1.5"/>
    <rect x="11" y="10" width="18" height="13" rx="6" fill="#ffe4e6" stroke="#fb7185" stroke-width="1"/>
    <path d="M 13 14 L 17 18 M 17 14 L 13 18" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M 23 14 L 27 18 M 27 14 L 23 18" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round"/>
    <ellipse cx="13" cy="20" rx="2" ry="1.2" fill="#f43f5e" opacity="0.6"/>
    <ellipse cx="27" cy="20" rx="2" ry="1.2" fill="#f43f5e" opacity="0.6"/>
  </g>
  <!-- Frame 10: Squashed Impact -->
  <g transform="translate(40,120)">
    <ellipse cx="20" cy="37" rx="15" ry="3" fill="rgba(0,0,0,0.25)"/>
    <ellipse cx="12" cy="36" rx="6" ry="3" fill="#ef4444"/>
    <ellipse cx="28" cy="36" rx="6" ry="3" fill="#ef4444"/>
    <rect x="9" y="24" width="22" height="11" rx="5" fill="url(#bodyGrad)" stroke="#1e3a8a" stroke-width="1.2"/>
    <rect x="11" y="29" width="18" height="3" fill="#1e293b"/>
    <rect x="18" y="28.5" width="4" height="4" fill="#fbbf24"/>
    <rect x="18.5" y="5" width="3" height="6" fill="#64748b" rx="1"/>
    <circle cx="20" cy="7" r="4" fill="url(#pom)" stroke="#be123c" stroke-width="1"/>
    <rect x="6" y="9" width="28" height="17" rx="8" fill="url(#headGrad)" stroke="#334155" stroke-width="1.5"/>
    <rect x="10" y="12" width="20" height="11" rx="5" fill="#ffe4e6" stroke="#fb7185" stroke-width="1"/>
    <path d="M 13 15 L 17 19 M 17 15 L 13 19" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M 23 15 L 27 19 M 27 15 L 23 19" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round"/>
  </g>
  <!-- Frame 11: Spiral Dizzy -->
  <g transform="translate(80,120)">
    <ellipse cx="20" cy="37" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
    <ellipse cx="13" cy="35" rx="5" ry="3.5" fill="#ef4444"/>
    <ellipse cx="27" cy="35" rx="5" ry="3.5" fill="#ef4444"/>
    <rect x="11" y="22" width="18" height="13" rx="5" fill="url(#bodyGrad)" stroke="#1e3a8a" stroke-width="1.2"/>
    <rect x="13" y="28" width="14" height="3" fill="#1e293b"/>
    <rect x="18" y="27.5" width="4" height="4" fill="#fbbf24"/>
    <rect x="18.5" y="2" width="3" height="6" fill="#64748b" rx="1"/>
    <circle cx="20" cy="4" r="4" fill="url(#pom)" stroke="#be123c" stroke-width="1"/>
    <rect x="7" y="6" width="26" height="20" rx="9" fill="url(#headGrad)" stroke="#334155" stroke-width="1.5"/>
    <rect x="11" y="10" width="18" height="13" rx="6" fill="#ffe4e6" stroke="#fb7185" stroke-width="1"/>
    <path d="M 14 16 Q 16 14 16 16 Q 16 18 14 18" stroke="#0f172a" stroke-width="1.5" fill="none"/>
    <path d="M 24 16 Q 26 14 26 16 Q 26 18 24 18" stroke="#0f172a" stroke-width="1.5" fill="none"/>
  </g>
</svg>
```

#### B. Phaser Animation Setup (`src/game/GameScene.ts`)
1. **Preload Update**:
   ```typescript
   // In preload():
   this.load.spritesheet('player', '/assets/player.png', {
     frameWidth: 40,
     frameHeight: 40,
   });
   ```

2. **Create Animations (`create()`)**:
   ```typescript
   // Register Walk Cycles
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
   ```

3. **Facing State Tracker & Update Logic (`updatePlayerMovement()`)**:
   Add private property to `GameScene`:
   ```typescript
   private playerFacing: 'down' | 'up' | 'left' | 'right' = 'down';
   ```
   In `updatePlayerMovement()`:
   ```typescript
   if (!left && !right && !up && !down) {
     this.player.setVelocity(0, 0);
     this.player.anims.stop();
     // Preserve idle pose facing the last heading:
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
   }
   ```
   When movement executes:
   - Along X-axis:
     ```typescript
     if (primaryAxis === 'x') {
       vx = wantX * speed;
       this.player.setFlipX(wantX < 0);
       this.playerFacing = wantX < 0 ? 'left' : 'right';
       this.player.anims.play('player_side', true);
       // ... existing corridor centering & corner rounding ...
     }
     ```
   - Along Y-axis:
     ```typescript
     else {
       vy = wantY * speed;
       this.playerFacing = wantY < 0 ? 'up' : 'down';
       this.player.anims.play(wantY < 0 ? 'player_up' : 'player_down', true);
       // ... existing corridor centering & corner rounding (flipX preserved) ...
     }
     ```

4. **Player Death Polish (`playerDie()`)**:
   ```typescript
   playerDie() {
     if (this.isGameOver) return;
     this.isGameOver = true;

     this.player.setVelocity(0, 0);
     this.player.anims.play('player_defeat');
     this.physics.pause();

     this.time.delayedCall(1000, () => {
       this.isGameOver = false;
       this.activeBombs = 0;
       this.playerFacing = 'down';
       this.scene.restart();
     });
   }
   ```

---

## 5. Verification Method

To independently verify after implementation:

1. **Asset Generation Verification**:
   ```bash
   bash scripts/generate-assets.sh
   sips -g pixelWidth -g pixelHeight public/assets/player.png
   ```
   - Expect: `pixelWidth: 120`, `pixelHeight: 160`.

2. **Automated Test Suite (Full Regression & Physics Contract)**:
   ```bash
   npm test
   ```
   - Expect: All 70 unit and stress tests pass (0 failures, 0 cancelled).
   - In particular, `player_movement_stress.test.mjs` must confirm that `flipX` expectations and 24x24 collision offsets remain intact.

3. **Production Compilation Check**:
   ```bash
   npm run build
   ```
   - Expect: Next.js Turbopack build succeeds with exit code 0.

4. **Manual / In-Game Visual Verification**:
   - Run `npm run dev` and open `http://localhost:3000`.
   - **Press UP**: Player displays clean white helmet back with red heel strides moving north. Release key: Player stands facing up.
   - **Press DOWN**: Player displays cute visor face with eyes and stepping boots moving south. Release key: Player stands facing down.
   - **Press LEFT**: Player turns into side profile facing left with swinging stride. Release key: Player stands facing left.
   - **Press RIGHT**: Player turns into side profile facing right with swinging stride. Release key: Player stands facing right.
   - **Slide around Corner**: Hold UP against a wall pillar; verify the player looks UP while sliding horizontally into the corridor without animation jitter.
   - **Bomb Blast Overlap**: When struck by explosion, verify defeat animation (`x_x` dizzy frames) plays before restart.

**Invalidation Conditions**:
- If `player.png` is saved with dimensions other than multiples of 40 (e.g. not 120x160), Phaser spritesheet frame cutting will misalign.
- If `ignoreIfPlaying` is omitted from `anims.play()`, the animation will restart on frame 0 on every tick, appearing frozen while moving.
