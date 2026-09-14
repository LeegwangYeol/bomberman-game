# Handoff Report: Asset Strategy & Rendering Architecture

**Agent**: Asset Strategy Explorer (`explorer_assets`)  
**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_assets`  
**Milestone**: Bomberman Prototype Real Image Asset Strategy  
**Date**: 2026-09-14  

---

## 1. Observation

1. **Public Directory Content**:
   Inspection of `/Users/user/src/bomberman/public` via directory listing:
   - Contained only 5 files: `file.svg` (391 B), `globe.svg` (1035 B), `next.svg` (1375 B), `vercel.svg` (128 B), `window.svg` (385 B).
   - No `assets/` folder existed, and zero game image assets (.png) were present in the repository.

2. **Procedural Graphics in GameScene.ts**:
   Inspection of `/Users/user/src/bomberman/src/game/GameScene.ts` (lines 31–74):
   ```typescript
   preload() {
     const g = this.make.graphics({x: 0, y: 0});
     // Wall: g.fillStyle(0x606060); g.fillRect(0, 0, TILE_SIZE, TILE_SIZE); g.generateTexture('wall', TILE_SIZE, TILE_SIZE);
     // Block: g.fillStyle(0xd2b48c); g.fillRect(0, 0, TILE_SIZE, TILE_SIZE); g.generateTexture('block', TILE_SIZE, TILE_SIZE);
     // Player: g.fillStyle(0xff5555); g.fillCircle(TILE_SIZE/2, TILE_SIZE/2, 16); g.generateTexture('player', TILE_SIZE, TILE_SIZE);
     // Enemy: g.fillStyle(0x9932CC); g.fillCircle(TILE_SIZE/2, TILE_SIZE/2, 16); g.generateTexture('enemy', TILE_SIZE, TILE_SIZE);
     // Bomb: g.fillStyle(0x222222); g.fillCircle(TILE_SIZE/2, TILE_SIZE/2, 14); g.generateTexture('bomb', TILE_SIZE, TILE_SIZE);
     // Explosion: g.fillStyle(0xffa500); g.fillRect(0, 0, TILE_SIZE, TILE_SIZE); g.generateTexture('explosion', TILE_SIZE, TILE_SIZE);
     // Floor: g.fillStyle(0x90ee90); g.fillRect(0, 0, TILE_SIZE, TILE_SIZE); g.generateTexture('floor', TILE_SIZE, TILE_SIZE);
   }
   ```
   Lines 146–150:
   ```typescript
   const offsetX = (800 - COLS * TILE_SIZE) / 2;
   const offsetY = (600 - ROWS * TILE_SIZE) / 2;
   this.cameras.main.setScroll(-offsetX, -offsetY);
   ```

3. **System Tooling & PNG Generation Verification**:
   - macOS `/usr/bin/sips` was verified functional.
   - Executed test pipeline in `/tmp/test_assets/make_assets.sh` rasterizing vector SVGs to PNG.
   - Result: Produced 9 valid 32-bit RGBA PNG files:
     - `background.png`: 800 x 600 px
     - `player.png`, `enemy.png`, `enemy_tracker.png`, `bomb.png`, `explosion.png`, `wall.png`, `block.png`, `floor.png`: 40 x 40 px
   - Verified with `sips -g pixelWidth -g pixelHeight`: all dimensions match exact target specifications.

4. **Next.js Static Asset Serving & Build Command**:
   - Tested `npm run build` in `/Users/user/src/bomberman`:
     Exited with code 0 (`Compiled successfully in 138ms`, `Finished TypeScript in 716ms`).
   - Static files in `public/assets/*.png` map directly to `/assets/*.png` under Next.js root routing without any special rewrites or API overhead.

---

## 2. Logic Chain

1. **Premise 1 (From Observation 1 & 2)**: The current prototype strictly uses procedural geometric primitives (circles and squares) generated via `make.graphics()`. Replacing these requires creating genuine `.png` files in `public/assets/` and loading them via `this.load.image(...)` inside `GameScene.preload()`.
2. **Premise 2 (From Requirements R1, R2 & GDD)**: The game requires distinct visual representations for:
   - The player character (cute Bomberman hero).
   - Normal wanderer enemies vs advanced tracking enemies (`enemy.png` vs `enemy_tracker.png`).
   - Obstacles (`wall.png` vs `block.png`) that are visually clear and contrast against the floor (`floor.png`).
   - Dynamic items (`bomb.png`, `explosion.png`).
   - A full-screen scenic backdrop (`background.png`, 800x600 px) to frame the 600x520 arena.
3. **Premise 3 (From Observation 3 & 4)**: Vector SVG source definitions rasterized via macOS built-in `sips` produce pristine, anti-aliased 32-bit RGBA PNG files with zero external dependencies and deterministic reproducibility.
4. **Premise 4 (From Observation 2 & Phaser Architecture)**:
   - Because `GameScene.ts` uses `this.cameras.main.setScroll(-100, -40)`, adding the 800x600 `background.png` with `setScrollFactor(0)` and `setDepth(-10)` at (400, 300) guarantees that the arena frame remains fixed to the camera viewport while the playfield sits centered within it.
   - Setting player and enemy physics hitboxes to `28x28` with `setOffset(6, 6)` inside the `40x40` sprites prevents Arcade Physics corner-snagging in narrow 1-tile corridors.

---

## 3. Caveats

1. **Multi-frame Animation Spritesheets**: This investigation scoped individual static PNG textures (`40x40` sprites and tiles) rather than multi-frame spritesheets (e.g. 4-direction walk cycles). For the current prototype acceptance criteria, static PNG textures with tween-based juice (bomb pulse, explosion fade) fulfill all requirements. Walk cycle spritesheets can be dropped into the same pipeline later if desired.
2. **Platform Dependency of Generator**: The automated script uses macOS `sips`. However, because the generated `.png` assets will be committed directly to `public/assets/`, downstream CI environments (like Linux Vercel runners) do NOT need `sips`—they simply serve the pre-generated `.png` files directly.

---

## 4. Conclusion

1. **Required Assets**: Exactly 9 PNG assets are needed in `public/assets/`:
   `player.png`, `enemy.png`, `enemy_tracker.png`, `bomb.png`, `explosion.png`, `wall.png`, `block.png`, `floor.png` (each 40x40 px) and `background.png` (800x600 px).
2. **Phaser Integration**:
   - `preload()`: Replace `make.graphics()` with 9 `this.load.image(...)` calls pointing to `/assets/<file>.png`.
   - `create()`: Add background image with `setScrollFactor(0)` and `setDepth(-10)`. Apply explicit Z-depths (0 for floor, 1 for walls/blocks, 5 for bombs, 9 for enemies, 10 for player, 12 for explosions).
   - Physics: Set character hitboxes to `28x28` (offset `6, 6`) to ensure smooth navigation.
3. **Actionable Implementation**: Full technical specification and asset code are documented in `/Users/user/src/bomberman/.agents/explorer_assets/report.md`. The implementation worker can generate the assets and update `GameScene.ts` immediately.

---

## 5. Verification Method

1. **Asset File Verification**:
   Inspect `public/assets/` to ensure all 9 `.png` files exist and have non-zero size:
   ```bash
   ls -la /Users/user/src/bomberman/public/assets/*.png
   ```
   Verify image dimensions using `sips`:
   ```bash
   sips -g pixelWidth -g pixelHeight /Users/user/src/bomberman/public/assets/*.png
   ```
2. **Compilation & Build Verification**:
   Run the Next.js production build:
   ```bash
   npm run build
   ```
   Expected: Exits with code 0 without type or lint errors.
3. **Phaser Texture Loading Invalidation Condition**:
   If any `this.load.image()` fails or references a missing file, Phaser logs `Texture "<key>" not found` in the console during runtime. Confirm zero console load warnings during scene initialization.
