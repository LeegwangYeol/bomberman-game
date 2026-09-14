## 2026-09-14T10:29:01Z

Implement the actual game code for the Bomberman prototype using real image assets, proper backgrounds, and advanced enemy AI. Use a very large team of agents to implement these features in the codebase and audit the final result.

Integrity mode: demo

## Requirements:
1. R1. Image Assets and Backgrounds:
   - Replace current Phaser graphics (circles/rectangles) with actual image assets (.png sprites for player, walls, blocks, bombs, explosions, enemies, and a proper background).
   - Make the UI look and feel like a high-quality, classic Bomberman game.
   - Real image assets must be loaded in the Phaser `preload()` function and used for all game entities.
2. R2. Enemy Attack AI:
   - Upgrade the enemy AI so they actively track and attack the player, rather than just wandering randomly.
   - Enemy update logic must include tracking the player's position and executing an attack.
3. R3. Implementation & Audit:
   - Implement these features directly into `src/game/GameScene.ts` and `src/components/BombermanGame.tsx`.
   - The team must thoroughly test and audit the code to ensure there are no bugs.
   - Acceptance Criteria:
     * Real image assets are loaded in Phaser `preload()` and used for all game entities.
     * Enemy update logic includes tracking player's position and executing an attack.
     * The game compiles successfully (`npm run build` exits with code 0).
