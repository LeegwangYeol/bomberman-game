# Codebase Survey Report: Bomberman Prototype

**Date:** 2026-09-14  
**Author:** Codebase Survey Explorer (`explorer_codebase`)  
**Target Workspace:** `/Users/user/src/bomberman`  
**Target Goal:** Deep analysis of existing architecture, dependencies, Phaser 4 initialization, `GameScene` mechanics, build system, and gap analysis for R1/R2/R3 implementation.

---

## 1. Executive Summary

The Bomberman codebase is a modern **Next.js 16 (Turbopack) + React 19 + Phaser 4.2.1** web application with full TypeScript support.
- **Client/Server Boundary:** Handled cleanly using Next.js dynamic imports with `ssr: false` in `src/app/page.tsx`, avoiding SSR DOM/window reference issues.
- **Current Graphics:** Procedural primitive vector textures generated at runtime via `Phaser.GameObjects.Graphics` inside `GameScene.preload()` (circles for player, enemies, bombs; rectangles for blocks, walls, floor).
- **Current AI:** Trivial random walk (enemies select a random cardinal direction 0..3 and change direction only when collision occurs with a wall or block).
- **Build Status:** `npm run build` succeeds cleanly (`exit code 0`). `npm run lint` flags 7 TypeScript ESLint `@typescript-eslint/no-explicit-any` errors in `BombermanGame.tsx` and `GameScene.ts`.

---

## 2. Project Architecture & Dependency Configuration

### 2.1 `package.json`
- **Engine / Core:**
  - `next`: `16.3.5` (Turbopack bundler)
  - `react`: `19.2.8`, `react-dom`: `19.2.8`
  - `phaser`: `^4.2.1` (Phaser 4 / Giedi release, compatible with Phaser 3 Arcade Physics API)
  - `nipplejs`: `^1.0.4` (Virtual joystick for mobile touch screens)
  - `lucide-react`: `^1.45.0` (Icons used for UI overlay buttons like the bomb trigger)
- **Dev Dependencies & Tooling:**
  - `typescript`: `^5`
  - `tailwindcss`: `^4` with `@tailwindcss/postcss`: `^4`
  - `eslint`: `^9` with `eslint-config-next`: `16.3.5`
- **Scripts:**
  - `"dev"`: `"next dev"`
  - `"build"`: `"next build"`
  - `"start"`: `"next start"`
  - `"lint"`: `"eslint"`

### 2.2 `tsconfig.json` & Path Aliasing
- Compiler target: `ES2017`, `moduleResolution: "bundler"`, `strict: true`.
- Path aliases: `"@/*": ["./src/*"]`.
- JSX: `"react-jsx"`.

### 2.3 Directory Structure
```
/Users/user/src/bomberman/
├── .agents/                 # Multi-agent coordination metadata
├── public/                  # Next.js static asset root (currently only default SVGs)
├── src/
│   ├── app/
│   │   ├── favicon.ico
│   │   ├── globals.css      # Tailwind v4 theme configuration
│   │   ├── layout.tsx       # Root layout with Geist fonts
│   │   └── page.tsx         # Page entrypoint disabling SSR for BombermanGame
│   ├── components/
│   │   └── BombermanGame.tsx # React wrapper, Phaser config, mobile overlay, NippleJS
│   └── game/
│       └── GameScene.ts     # Core Phaser scene (grid, player, enemies, bombs, physics)
├── eslint.config.mjs        # Flat ESLint config
├── next.config.ts           # Next.js configuration
├── package.json
└── tsconfig.json
```

---

## 3. Component & Phaser Lifecycle (`BombermanGame.tsx`)

### 3.1 SSR Isolation
In `src/app/page.tsx`:
```typescript
const BombermanGame = dynamic(() => import('@/components/BombermanGame'), {
  ssr: false,
  loading: () => <p className="text-xl font-bold animate-pulse">Loading Game...</p>,
});
```
This guarantees that Phaser is never instantiated on the Node.js server during SSR or static prerendering.

### 3.2 Game Initialization & Destruction
- **Mount Container:** `<div ref={gameRef} className="w-full max-w-4xl max-h-screen ..." style={{ aspectRatio: '4/3' }} />`.
- **Phaser Configuration (`lines 40-59`):**
  ```typescript
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: gameRef.current,
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0, x: 0 },
        debug: false
      }
    },
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    backgroundColor: '#87CEEB',
  };
  phaserGameRef.current = new Phaser.Game(config);
  ```
- **Cleanup:** `useEffect` return handler invokes `phaserGameRef.current.destroy(true)` to prevent memory leaks and duplicate canvas elements across React re-renders.

### 3.3 Mobile Touch Input Bridge
- `BombermanGame.tsx` augments the global `Window` interface with `mobileInput`:
  ```typescript
  declare global {
    interface Window {
      mobileInput: {
        up: boolean;
        down: boolean;
        left: boolean;
        right: boolean;
        bomb: boolean;
      };
    }
  }
  ```
- Detects mobile via `'ontouchstart' in window || window.innerWidth < 768`.
- Mounts a `nipplejs` virtual joystick inside `joystickRef`:
  - Translates joystick movement angle (0° to 360°) into 4 cardinal boolean flags on `window.mobileInput`.
- Bomb button sets `window.mobileInput.bomb = true` for 100ms on pointer down.

---

## 4. GameScene Internal Architecture (`GameScene.ts`)

### 4.1 Grid Coordinates & Arena Geometry
- `TILE_SIZE = 40` px
- `ROWS = 13`, `COLS = 15`
- Arena size: $15 \times 40 = 600$ px wide, $13 \times 40 = 520$ px high.
- Centering offset in the 800x600 viewport:
  - `offsetX = (800 - 600) / 2 = 100` px
  - `offsetY = (600 - 520) / 2 = 40` px
  - `this.cameras.main.setScroll(-offsetX, -offsetY)` shifts the camera so world `(0,0)` corresponds to the top-left tile of the grid.
- Tile encoding in `this.map: number[][]`:
  - `0 = TILE_EMPTY`
  - `1 = TILE_WALL` (Perimeter border + alternating inner pillars `r % 2 === 0 && c % 2 === 0`)
  - `2 = TILE_BLOCK` (Soft destructible blocks placed with 60% probability, except safe zone around `(1,1)`)

### 4.2 Texture Generation (`preload()`)
Currently uses procedural graphic generation instead of external files:
| Texture Key | Graphic Type | Dimensions / Specs | Color / Hex |
|-------------|--------------|-------------------|-------------|
| `'wall'`    | Rectangle    | 40x40 px          | `#606060` (Gray) |
| `'block'`   | Rectangle    | 40x40 px          | `#d2b48c` (Tan) |
| `'player'`  | Circle       | radius 16 px      | `#ff5555` (Red) |
| `'enemy'`   | Circle       | radius 16 px      | `#9932CC` (Purple) |
| `'bomb'`    | Circle       | radius 14 px      | `#222222` (Dark gray) |
| `'explosion'` | Rectangle  | 40x40 px          | `#ffa500` (Orange) |
| `'floor'`   | Rectangle    | 40x40 px          | `#90ee90` (Light green) |

*Requirement R1 asks to replace these placeholders with real image assets loaded via `this.load.image` or spritesheets.*

### 4.3 Physics Groups & Collision Hierarchy
- **Static Groups:**
  - `this.walls`: Unbreakable perimeter and pillar blocks.
  - `this.blocks`: Breakable blocks storing `row` and `col` data.
- **Dynamic Groups:**
  - `this.bombs`: Immovable physics sprites placed on the grid.
  - `this.enemies`: Dynamic arcade sprites with collision bounds.
  - `this.explosions`: Temporary physics trigger zones.
- **Collision Rules:**
  - Player collides with: `walls`, `blocks`, `bombs`.
  - Enemies collide with: `walls`, `blocks`, `bombs`.
  - Player overlaps Enemy $\rightarrow$ `this.playerDie()`.
  - Explosion overlaps Player $\rightarrow$ `this.playerDie()`.
  - Explosion overlaps Enemy $\rightarrow$ `enemyHit.destroy()`.

### 4.4 Movement & Input Handling (`update()`)
- Speed: `playerSpeed = 150`, `enemySpeed = 60`.
- Player reads either `this.cursors` (Arrow keys) or `window.mobileInput`.
- Orthogonal priority: Left $\rightarrow$ Right $\rightarrow$ Up $\rightarrow$ Down.
- Hitbox sizing: `player.body.setSize(24, 24)` allows navigation through 40px corridors.

### 4.5 Bomb & Explosion Raycasting
- Single bomb limit (`maxBombs = 1`, `activeBombs = 0`).
- Placement:
  - Triggered by `Phaser.Input.Keyboard.JustDown(this.spaceKey)` or `mInput.bomb`.
  - Snaps to center of player tile: `centerX = col * 40 + 20`, `centerY = row * 40 + 20`.
  - Ignores if a bomb already occupies that tile.
  - Bomb detonates after 2000ms delay (`this.time.delayedCall(2000, ...)`).
- Raycast Algorithm:
  - Center tile explodes.
  - For each cardinal direction (`{dr: -1, dc: 0}`, `{dr: 1, dc: 0}`, `{dr: 0, dc: -1}`, `{dr: 0, dc: 1}`):
    - Loops $i = 1$ to `bombPower` ($2$):
      - If `TILE_WALL`: ray stops immediately (`break`).
      - If `TILE_BLOCK`: destroys block in `this.map` and `this.blocks`, spawns explosion, and stops (`break`).
      - If empty: spawns explosion and continues.
- Explosions self-destroy after 300ms.

### 4.6 Current Enemy AI Mechanics
- Spawns 3 enemies in empty tiles between rows 5..11 and cols 5..13.
- Each enemy has a direction data property `0..3` (0: Up, 1: Right, 2: Down, 3: Left).
- In `update()`:
  - If `enemy.body.blocked.up / down / left / right` is true, picks a random direction: `enemy.setData('direction', Phaser.Math.Between(0, 3))`.
  - Sets velocity in that direction at 60 px/sec.
- **Deficiencies:**
  - Completely blind to player position.
  - No pathfinding, grid-snapping, or tracking.
  - No active attack or ranged action.
  - Can get stuck vibrating between two opposing obstacles if random picks reverse direction.

---

## 5. Build, Compilation & Quality Diagnostics

### 5.1 Compilation Verification (`npm run build`)
- **Command:** `npm run build` (`next build`)
- **Execution Time:** ~250ms compile + ~700ms TypeScript check.
- **Exit Code:** `0` (Success).
- Output confirms Next.js 16.3.5 generates static routes (`/` and `/_not-found`).

### 5.2 Linting Diagnostics (`npm run lint`)
- **Command:** `npm run lint` (`eslint`)
- **Exit Code:** `1` (Failed with 7 errors):
  1. `src/components/BombermanGame.tsx:84:19`: Unexpected any (`(manager as any).on('move', (evt: any, data: any) => {`)
  2. `src/components/BombermanGame.tsx:84:41`: Unexpected any
  3. `src/components/BombermanGame.tsx:84:52`: Unexpected any
  4. `src/components/BombermanGame.tsx:92:19`: Unexpected any (`(manager as any).on('end', () => {`)
  5. `src/game/GameScene.ts:212:48`: Unexpected any (`this.enemies.getChildren().forEach((child: any) => {`)
  6. `src/game/GameScene.ts:247:46`: Unexpected any (`this.bombs.getChildren().forEach((child: any) => {`)
  7. `src/game/GameScene.ts:324:47`: Unexpected any (`this.blocks.getChildren().forEach((child: any) => {`)

**Recommendation for Implementation Team:**  
Type-safe casts (e.g., `Phaser.GameObjects.GameObject`, `Phaser.Physics.Arcade.Sprite`) and proper typings for NippleJS will eliminate these errors, ensuring both `npm run build` and `npm run lint` pass with 0 errors.

---

## 6. Gap Analysis & Implementation Roadmap for R1, R2, R3

### Requirement R1: Image Assets & Backgrounds
- **Current State:** Zero static image files in `public/assets/`. `GameScene.preload()` creates procedural graphics.
- **Required Changes:**
  1. Place high-quality retro/cute PNG assets in `public/assets/` (e.g. `player.png`, `enemy.png`, `bomb.png`, `explosion.png`, `wall.png`, `block.png`, `floor.png`, and a stage background).
  2. In `GameScene.preload()`, replace `make.graphics()` with `this.load.image('key', '/assets/key.png')` or sprite sheets.
  3. Ensure image aspect ratios and resolutions fit the 40x40 tile grid (or scale sprites appropriately via `.setDisplaySize(TILE_SIZE, TILE_SIZE)`).
  4. Replace solid floor fill with tiled or full-arena background art.

### Requirement R2: Enemy Tracking & Attack AI
- **Current State:** Random bounce on wall collision.
- **Required Changes:**
  1. **Line-of-Sight & Distance Tracking:** Calculate Manhattan/Euclidean distance to `this.player`.
  2. **Pathfinding / Direction Selection:**
     - Check grid tile walkability (checking `this.map[r][c] === TILE_EMPTY` and avoiding active bombs).
     - Greedily pick directions that reduce distance to player or use BFS/A* on the 13x15 grid (extremely cheap on a 195-tile grid: <0.1ms).
  3. **Attack Behavior:**
     - When within attack range or line of sight, trigger attack state (charge sprint, projectile / bomb drop, or pounce).
     - Provide visual attack indicator (tint change, animation, or attack sprite).

### Requirement R3: Implementation & Audit
- **Files Affected:**
  - `src/game/GameScene.ts`: Asset preloading, entity creation, AI tracking, attack logic, collision updates.
  - `src/components/BombermanGame.tsx`: Type-safety cleanup, UI polish, controls verification.
  - `public/assets/`: New asset files.
- **Verification Commands:**
  - `npm run build`: Must exit with code 0.
  - `npm run lint`: Should be clean of `any` errors.

---

## 7. Architectural Recommendations for Implementation Agents

1. **Asset Loading Protocol:**
   Use standard public pathing (`/assets/<file>.png`). In Next.js, files under `public/assets/` are served at root `/assets/`.
2. **Grid Alignment for AI:**
   Keep movement velocity aligned to tile centers or employ tile-based step movement with arcade physics velocity interpolations to prevent enemies from clipping corner corners.
3. **TypeScript Strictness:**
   Define explicit interfaces for enemy data (`enemy.getData(...)`) and avoid `any` in group iterations (`(child) => { const s = child as Phaser.Physics.Arcade.Sprite; ... }`).
