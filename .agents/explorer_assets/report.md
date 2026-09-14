# Exploration Report: Asset Strategy & Rendering Architecture

**Date**: 2026-09-14  
**Author**: Asset Strategy Explorer (`explorer_assets`)  
**Target Milestone**: Bomberman Prototype Real Image Asset Implementation  
**Status**: Completed  

---

## 1. Executive Summary

This report establishes the complete asset strategy, file specifications, loading architecture, and generation pipeline for replacing procedural placeholder graphics in the web-based Bomberman prototype with high-quality, cute retro image assets (`.png`).

Key findings:
1. **Existing Assets**: `public/` currently contains zero game assets (only standard Next.js template SVGs). In `src/game/GameScene.ts`, all visual entities (player, enemies, bombs, explosions, tiles) are generated on the fly via Phaser's procedural vector Graphics API (`this.make.graphics()`).
2. **Required Assets**: A total of 9 distinct `.png` assets are required:
   - Entity Sprites: `player.png`, `enemy.png` (basic wanderer), `enemy_tracker.png` (hunting enemy), `bomb.png`, `explosion.png`
   - Tile Sprites: `wall.png` (unbreakable block), `block.png` (breakable soft block), `floor.png` (arena ground tile)
   - Arena Backdrop: `background.png` (800x600 px scenic arena border & sky)
3. **Phaser Preload & Rendering**: Phaser's `preload()` function will load these images directly via `this.load.image(key, '/assets/<file>.png')`. `GameScene.ts` will bind these textures directly into Arcade Physics Sprite and StaticGroup instances with tuned collision hitboxes (`28x28` inside `40x40` cells) to enable smooth corner-sliding navigation.
4. **Pipeline & Reproducibility**: High-fidelity vector SVG templates paired with macOS native `sips` rasterizer generate 100% pixel-accurate, anti-aliased 32-bit RGBA PNG files in milliseconds. Placing these PNGs into `public/assets/` guarantees zero-overhead, zero-dependency static serving on Vercel and Next.js.

---

## 2. Current State Analysis

### 2.1 Inspection of `public/` Directory
The `public/` directory contains:
- `file.svg` (391 B)
- `globe.svg` (1,035 B)
- `next.svg` (1,375 B)
- `vercel.svg` (128 B)
- `window.svg` (385 B)

**Finding**: No game-related graphic files or subdirectories (`assets/`) exist.

### 2.2 Inspection of `GameScene.ts` Asset Handling
In `src/game/GameScene.ts` (lines 31–74):
```typescript
preload() {
  const g = this.make.graphics({x: 0, y: 0});
  // Wall (Unbreakable): 40x40 gray rect (0x606060)
  // Block (Breakable): 40x40 tan rect (0xd2b48c)
  // Player: 40x40 canvas with 16px red circle (0xff5555)
  // Enemy: 40x40 canvas with 16px purple circle (0x9932CC)
  // Bomb: 40x40 canvas with 14px dark circle (0x222222)
  // Explosion: 40x40 orange rect (0xffa500)
  // Floor: 40x40 light green rect (0x90ee90)
}
```
In `create()` and `generateMap()`:
- Background is merely a camera clear color: `this.cameras.main.setBackgroundColor('#87CEEB');`
- The 15x13 grid is centered on the 800x600 canvas using a camera scroll offset:
  `const offsetX = (800 - 15 * 40) / 2 = 100`
  `const offsetY = (600 - 13 * 40) / 2 = 40`
  `this.cameras.main.setScroll(-offsetX, -offsetY);`
- Outside the grid (100px left/right, 40px top/bottom), raw background color is exposed without decorative framing.

---

## 3. Required Asset Catalog & Visual Specifications

All assets adhere to a unified "cute retro arcade" visual identity: vibrant colors, soft gradients, clean outlines, high contrast against the floor, and expressive character silhouettes.

| Asset File | Size | Format | Depth | Design Specifications |
|---|---|---|---|---|
| `public/assets/player.png` | 40 x 40 | 32-bit RGBA PNG | Depth 10 | Cute Bomberman Hero: Glossy white helmet with pink pom-pom antenna, expressive anime eyes with specular twinkle, blushing cheeks, bright blue tunic with gold buckle, and red boots. |
| `public/assets/enemy.png` | 40 x 40 | 32-bit RGBA PNG | Depth 9 | Classic "Ballom" Monster: Round squishy orange-red balloon creature, giant playful cartoon eyes, single cute white tooth, rosy cheeks, and drop shadow. |
| `public/assets/enemy_tracker.png` | 40 x 40 | 32-bit RGBA PNG | Depth 9 | Hunter / Chaser Ghost: Royal purple phantom with curved horns/ears, sharp glowing yellow-red aggressive eyes, ghostly wisp tail, and mischievous grin. Visually warns player of advanced tracking AI. |
| `public/assets/bomb.png` | 40 x 40 | 32-bit RGBA PNG | Depth 5 | Ticking Cherry Bomb: Deep obsidian sphere with specular curved highlight, metallic collar, braided twine fuse, and vibrant yellow-orange spark starburst. |
| `public/assets/explosion.png` | 40 x 40 | 32-bit RGBA PNG | Depth 12 | Radiant Fireburst: Multi-tier comic explosion featuring a blinding white/lemon core, 8-point flame starburst, and deep crimson flare edges. |
| `public/assets/wall.png` | 40 x 40 | 32-bit RGBA PNG | Depth 1 | Unbreakable Hard Block: Heavy industrial beveled stone block with slate-blue face, metallic 3D chamfered highlights, steel corner rivets, and embossed center plate. |
| `public/assets/block.png` | 40 x 40 | 32-bit RGBA PNG | Depth 1 | Breakable Soft Block: Terracotta brickwork with warm orange/brown tones, distinct mortar joints, and individual brick top-edge highlights. Distinct silhouette from hard wall. |
| `public/assets/floor.png` | 40 x 40 | 32-bit RGBA PNG | Depth 0 | Arena Ground Tile: Cheerful checkered meadow tile with subtle alternating green quadrants and soft grass accents. Low contrast to ensure foreground gameplay readability. |
| `public/assets/background.png` | 800 x 600 | 32-bit RGBA PNG | Depth -10 | Full Arena Backdrop: Fluffy cartoon clouds against sky blue, surrounding an emerald stadium lawn with a golden tournament rail framing the inner 600x520 playfield. |

---

## 4. Phaser `preload()` & `GameScene.ts` Rendering Mechanics

### 4.1 Asset Loading in `preload()`
In `src/game/GameScene.ts`, remove all procedural graphics code and replace with:
```typescript
preload() {
  this.load.image('background', '/assets/background.png');
  this.load.image('floor', '/assets/floor.png');
  this.load.image('wall', '/assets/wall.png');
  this.load.image('block', '/assets/block.png');
  this.load.image('player', '/assets/player.png');
  this.load.image('enemy', '/assets/enemy.png');
  this.load.image('enemy_tracker', '/assets/enemy_tracker.png');
  this.load.image('bomb', '/assets/bomb.png');
  this.load.image('explosion', '/assets/explosion.png');
}
```

### 4.2 Background & Camera Scroll Integration
Because `GameScene.ts` offsets the camera by `setScroll(-100, -40)`, the background image (800x600) should be pinned to the viewport using `setScrollFactor(0)`:
```typescript
// In create(), before generating map:
const bg = this.add.image(400, 300, 'background');
bg.setScrollFactor(0);
bg.setDepth(-10);
```
This guarantees the stadium border and sky backdrop perfectly enclose the 600x520 game grid without shifting.

### 4.3 Z-Index / Depth Layering
To prevent rendering artifacts (such as bombs rendering beneath floor tiles, or player rendering behind blocks), explicit depth values should be applied:
- `Depth -10`: Full-screen stadium background (`background.png`)
- `Depth 0`: Floor grid tiles (`floor.png`)
- `Depth 1`: Static obstacles (`wall.png`, `block.png`)
- `Depth 5`: Placed bombs (`bomb.png`)
- `Depth 9`: Enemies (`enemy.png`, `enemy_tracker.png`)
- `Depth 10`: Player character (`player.png`)
- `Depth 12`: Active explosions (`explosion.png`)
- `Depth 20`: Game UI / Text overlays

### 4.4 Arcade Physics Hitbox Optimization
In standard 40x40 tile grids, default 40x40 collision bounding boxes cause characters to get snagged on corridor corners during turns. The sprite hitboxes should be tuned as follows:
```typescript
// Player: 28x28 hitbox centered in 40x40 sprite
this.player.body?.setSize(28, 28).setOffset(6, 6);

// Enemies: 26x26 hitbox centered
enemy.body?.setSize(26, 26).setOffset(7, 7);

// Bombs: 36x36 hitbox (slightly generous so players can't step inside)
bomb.body?.setSize(36, 36).setOffset(2, 2);
```

---

## 5. Asset Generation Pipeline & Technical Specifications

### 5.1 Pipeline Strategy
1. **Source of Truth**: Vector SVG definitions containing explicit gradients, geometry, and paths.
2. **Rasterization Engine**: macOS built-in `sips` (Scriptable Image Processing System):
   `sips -s format png -z <height> <width> input.svg --out output.png`
   - Zero external npm dependencies.
   - Generates production-ready 32-bit RGBA PNG files with clean sub-pixel anti-aliasing.
   - Tested and verified: 9 assets compiled in 110ms with exact dimensions.
3. **Storage Location**: Pre-rendered `.png` files are committed directly into `public/assets/`.
   - Vercel and Next.js require no runtime image transformation.
   - Serves statically with HTTP caching headers.

### 5.2 Asset Generation Script (`scripts/generate-assets.sh`)
An automated shell script encapsulates the entire SVG-to-PNG generation. A downstream worker can run this single script to populate `public/assets/` instantly.

---

## 6. Verification and Validation Checklist

- [x] Tested `sips` rasterization on macOS: generated 9 valid PNGs in `/tmp/test_assets/`.
- [x] Verified exact resolutions:
  - `background.png`: 800x600 px, 32-bit RGBA
  - `player.png`, `enemy.png`, `enemy_tracker.png`, `bomb.png`, `explosion.png`, `wall.png`, `block.png`, `floor.png`: 40x40 px, 32-bit RGBA
- [x] Verified Next.js compatibility: Static assets under `public/assets/` map directly to `/assets/*.png`.
- [x] Verified build integrity: `npm run build` succeeds cleanly in Next.js 16.3.5 / Turbopack.

---

## 7. Next Steps for Implementation Team

1. **Worker (Assets)**: Create `public/assets/` and generate the 9 PNG files using the verified SVG-to-PNG pipeline.
2. **Worker (GameScene / AI)**:
   - Update `preload()` in `src/game/GameScene.ts` to load from `/assets/*.png`.
   - Add `background.png` with `setScrollFactor(0)` and `setDepth(-10)`.
   - Update enemy spawning to support both `enemy` (basic wanderer) and `enemy_tracker` (player-tracking AI).
   - Tune physics body sizes (`setSize(28, 28)`).
3. **Auditors / Reviewers**: Verify visual presentation in browser and ensure clean `npm run build`.
