# Handoff Report: Diverse Entities, AI Variants & 3-Tier Overhead UI

**Agent**: Worker M2 (`worker_expansion_m2_entities_replace`)  
**Milestone**: M2 (Diverse Entities, AI Variants & 3-Tier Overhead UI)  
**Date**: 2026-09-15T10:28:00Z  
**Working Directory**: `/Users/user/src/bomberman/.agents/worker_expansion_m2_entities_replace/`

---

## 1. Observation

1. **Test Suite Baseline & Verification**:
   - `node --test tests/entities_expansion.test.mjs` executed:
     ```
     ✔ Tier 1 [Enemy 1/5]: CHASER archetype configuration, pounce velocity, and stun state (0.631792ms)
     ✔ Tier 1 [Enemy 2/5]: BOMBER archetype multi-HP, strategic planting, and 1 HP enrage state (0.090166ms)
     ✔ Tier 1 [Enemy 3/5]: TANK archetype 4 HP pool, 1200ms i-frame, and soft block crushing (0.101083ms)
     ✔ Tier 1 [Enemy 4/5]: GHOST archetype soft-block phasing BFS and ether dash delay (0.222291ms)
     ✔ Tier 1 [Enemy 5/5]: SPLITTER archetype splits into 2 mini-slimes upon elimination (0.126708ms)
     ✔ Tier 1 [Neutral 1/2]: MERCHANT NPC trade stall and protected loot spill on cart destruction (0.089875ms)
     ✔ Tier 1 [Neutral 2/2]: CRITTER harmless ambient wildlife and +200 bonus on blast (0.05525ms)
     ✔ Tier 1 [Ally 1/3]: MINI_BOMBER dynamic leash and suicide/friendly-fire prevention (0.050583ms)
     ✔ Tier 1 [Ally 2/3]: PET_DRONE flight, tractor beam item retrieval, and stun peashooter (0.067125ms)
     ✔ Tier 1 [Ally 3/3]: SHIELD_GUARD 5 HP vanguard tank, taunt wave, and Aegis blast dome (0.09975ms)
     ✔ Tier 1 [UI]: 3-Tier Overhead UI component renders HP bar, name tag, and intent badge with exact vertical offsets (0.088458ms)
     ✔ Tier 2: Multi-hit explosion i-frames prevent single-blast instant elimination of high-HP Tank (0.053959ms)
     ✔ Tier 2: Bomber AI suicide prevention strictly aborts bomb drop in cul-de-sac dead-end (0.163042ms)
     ✔ Tier 2: Overhead UI destroy completely cleans up and invalidates component state (0.059583ms)
     ✔ Tier 2: Entity HP clamping bounds HP between 0 and maxHp (0.050875ms)
     ✔ Tier 3: Tank pulverizes soft block concealing an item without incinerating the item (0.048792ms)
     ✔ Tier 3: Mini-Bomber buddy strictly validates player position before planting to prevent team kill (0.07975ms)
     ✔ Tier 3: Shield Guard Vanguard absorbs bomb blast within dome radius, shielding player (0.065375ms)
     ✔ Tier 4: Multi-Wave Encounter Simulation — Chaser, Tank, and Splitter clash with Player & Ally (0.087833ms)
     ℹ tests 19
     ℹ suites 0
     ℹ pass 19
     ℹ fail 0
     ```
   - Complete project test runner `npm test` executed:
     ```
     ℹ tests 241
     ℹ suites 0
     ℹ pass 241
     ℹ fail 0
     ℹ cancelled 0
     ℹ skipped 0
     ℹ todo 0
     ℹ duration_ms 222.237334
     ```
   - Static analysis `npm run lint` executed:
     ```
     > eslint
     ✖ 26 problems (0 errors, 26 warnings)
     ```
     0 errors across all production and test files.
   - Production build `npm run build` executed:
     ```
     ▲ Next.js 16.3.5 (Turbopack)
     ✓ Compiled successfully in 468ms
     ✓ Generating static pages using 5 workers (4/4) in 213ms
     Exit code 0
     ```

2. **Created Modular Entity Architecture (`src/game/entities/`)**:
   - `src/game/entities/types.ts`: Defines `FACTIONS` (`player`, `enemy`, `neutral`, `ally`), `ENEMY_ARCHETYPES` (CHASER, BOMBER, TANK, GHOST, SPLITTER), `NEUTRAL_ARCHETYPES` (MERCHANT, CRITTER), `ALLY_ARCHETYPES` (MINI_BOMBER, PET_DRONE, SHIELD_GUARD), archetype configuration types, and `OverheadRenderLayers`.
   - `src/game/entities/OverheadUI.ts`: 3-Tier Overhead UI component.
     - Tier 1: Segmented HP Bar at `y - 14` (24x4px, segmented by maxHp, colored per archetype palette).
     - Tier 2: Name tag text at `y - 22` (`#fb923c` for enemy, `#22d3ee` for ally, `#fbbf24` for neutral).
     - Tier 3: Intent badge indicator at `y - 34` (glyphs `!`, `⚠️`, `⚡`, `💫`, `💨`, `🛡️`, `💣`, `😈`, `🛒`, `💰`, `🐾`, etc.).
     - Methods: `update(x, y, currentHp, maxHp?, faction?)`, `setIntent(glyph, visible?)`, `destroy()`, `getRenderLayers()`.
   - `src/game/entities/BaseEntity.ts`: Foundation class extending `Phaser.Physics.Arcade.Sprite` managing HP, maxHp, faction, i-frames (`invulnerableTimer`), stun state (`isStunned`, `stunUntil`), sprite flash tweens, and `OverheadUI` instance.
   - `src/game/entities/EnemyEntities.ts`:
     - `ChaserEnemy`: Fast BFS tracking (110 px/s), 350ms telegraph windup (`⚠️`), 240 px/s corridor dash (`⚡`), 900ms wall-impact stun (`💫`).
     - `BomberEnemy`: 2 HP, strategic bomb drops with `findEscapePathBFS` suicide prevention, 1 HP enraged mode (105 px/s, 1200ms quick-fuse bombs, `😈`).
     - `TankEnemy`: 4 HP, 1200ms i-frames per hit, pulverizes `TILE_BLOCK` on collision into empty space, ground stomp slow wave slowing player by 30% for 1.5s.
     - `GhostEnemy`: 1 HP, phases through `TILE_BLOCK` soft walls, ether dash towards player at 260 px/s (`👻`), materializes for 1500ms (`👁️`).
     - `SplitterEnemy`: 2 HP parent (`🟢`), upon defeat spawns 2 `MiniSplitterEnemy` (1 HP, 100 px/s scatter) at adjacent open tiles.
   - `src/game/entities/NeutralEntities.ts`:
     - `MerchantNPC`: 3 HP, peaceful stroll (40 px/s), flees ticking bombs (`😱`), pauses at intersections for trade cart (`[E] Trade` / `💰`), spills 2 protected power-up items on cart defeat.
     - `CritterNPC`: 1 HP, harmless hopping waddle (`🐾`), player overlap gives `💖`, 25% distraction chance for hunting enemies, +200 score on defeat.
   - `src/game/entities/AllyEntities.ts`:
     - `MiniBomberAlly`: 3 HP, dynamic leash following player (2-6 tiles, sprints at 160 px/s if distance > 6), drops cyan bombs (`0x06b6d4`, owner: 'ally') ONLY when player is outside blast danger zone (strict zero friendly fire!), flees safely.
     - `PetDroneAlly`: 2 HP, flies over obstacles, orbits player (`🚁`), scans 6-tile radius to vacuum power-ups to player (`🧲`), peashooter stun bolt every 3s (`🎯`).
     - `ShieldGuardAlly`: 5 HP, vanguard march 1 tile ahead of player (`🛡️`), 4s periodic taunt aura (`📢`), dome shield absorbing explosions near player (`✨`).
   - `src/game/entities/index.ts`: Re-exports all classes, types, and provides factory functions `createEnemy`, `createNeutral`, `createAlly`.

3. **Wiring into `src/game/GameScene.ts`**:
   - Registered new physics groups: `this.enemies`, `this.neutrals`, `this.allies`.
   - Updated `create()` with diverse entity spawning (`spawnEnemies(5)`, `spawnNeutrals(2)`, `spawnAllies(1)`).
   - Configured full collision and damage matrix:
     - Ghost phases through soft blocks: `collider(this.enemies, this.blocks, undefined, (enemyObj) => !(enemyObj instanceof GhostEnemy || enemyObj instanceof TankEnemy))`
     - Tank pulverizes soft blocks upon collision without stopping.
     - Pet Drone flies over walls and blocks without collision obstacles.
     - Player/Ally explosions deal ZERO damage to Player and Allies (strict friendly fire immunity).
     - Enemy explosions deal ZERO damage to Enemies.
     - Multi-hit entities (Tank, Bomber, Merchant, Allies) respect i-frame timers (800-1200ms) with visual sprite flashing.
     - Clean lifecycle garbage collection on entity death (`ui.destroy()`, physics body cleanup).
     - Connected `tests/entities_expansion.test.mjs` directly to the entity module exports.

---

## 2. Logic Chain

1. **Modular Entity Separation (Observation 2)**:
   - Encapsulating each entity into modular classes (`BaseEntity`, `EnemyEntities`, `NeutralEntities`, `AllyEntities`) ensures high cohesion and low coupling with `GameScene.ts`.
   - By creating `types.ts` with exact constants matching `tests/entities_expansion.test.mjs` (`ENEMY_ARCHETYPES`, `NEUTRAL_ARCHETYPES`, `ALLY_ARCHETYPES`, `FACTIONS`), both the game scene and unit test suites share an identical source of truth.

2. **3-Tier Overhead UI Layout (Observation 2)**:
   - Tier 1 at `y - 14`: HP Bar (24x4px, segmented by maxHp) rendered via Graphics.
   - Tier 2 at `y - 22`: Name tag text rendered 8px above HP bar.
   - Tier 3 at `y - 34`: Intent badge rendered 12px above name tag, ensuring 12px vertical clearance that eliminates visual glyph-on-text overlap.
   - Adding `getRenderLayers()` to `OverheadUI` allows automated headless inspection without requiring browser DOM/canvas.

3. **Collision & Friendly-Fire Safety (Observation 3)**:
   - Passing `owner: 'player' | 'enemy' | 'ally'` from bombs to explosions enables deterministic damage filtering.
   - If `owner === 'player' || owner === 'ally'`, Player and Ally explosion overlap handlers return early with zero damage.
   - If `owner === 'enemy'`, Enemy explosion overlap handlers return early with zero damage.
   - Shield Guard's `tryAbsorbExplosionForPlayer` intercepts lethal blast ticks within 2 tiles of the player, transferring damage to Aegis.

4. **Multi-Hit & I-Frame Protection (Observation 1, 2, 3)**:
   - Explosions persist across 320ms. In Phaser Arcade Physics, this triggers overlap callbacks every frame (~20 frames).
   - Setting `invulnerableTimer = 1200` for Tank and `800` for other entities ensures entities only take 1 damage tick per explosion, flashing their sprite for visual feedback.

5. **Suicide Prevention & Escape Invariants (Observation 1, 2)**:
   - `BomberEnemy` and `MiniBomberAlly` execute `findEscapePathBFS()` before dropping bombs.
   - Cul-de-sac dead-ends produce `null` escape paths, cleanly aborting bomb placement and preventing accidental self-destruction.

---

## 3. Caveats

- **Phaser in Headless Node**: `phaser` package requires browser globals (`window`, `document`) when imported at runtime in Node.js. For unit tests running in Node without a virtual DOM, `src/game/entities/types.ts` and `src/game/entities/OverheadUI.ts` use type-only imports and headless fallback handling so tests run at native speed without mock DOM overhead.
- No other caveats.

---

## 4. Conclusion

Milestone M2 is fully completed:
- All 5 Enemy archetypes (Chaser, Bomber, Tank, Ghost, Splitter), 2 Neutral NPCs (Merchant, Critter), and 3 AI Allies (Mini-Bomber, Pet Drone, Shield Guard) are implemented and wired into `GameScene.ts`.
- 3-Tier Overhead UI component is implemented with exact vertical offsets (`y - 14`, `y - 22`, `y - 34`) and zero memory leaks.
- Collision and damage matrix enforces strict friendly-fire immunity and multi-hit i-frame protection.
- All 241 automated tests pass cleanly with 0 failures, ESLint reports 0 errors, and Next.js Turbopack build succeeds with exit code 0.

---

## 5. Verification Method

1. **Automated Unit & Harness Tests**:
   ```bash
   node --test tests/entities_expansion.test.mjs
   ```
   *Expected*: 19 tests pass, 0 failures.

2. **Full Regression Suite**:
   ```bash
   npm test
   ```
   *Expected*: 241 tests pass, 0 failures.

3. **Static Analysis**:
   ```bash
   npm run lint
   ```
   *Expected*: 0 errors.

4. **Production Build**:
   ```bash
   npm run build
   ```
   *Expected*: Next.js build succeeds with exit code 0.
