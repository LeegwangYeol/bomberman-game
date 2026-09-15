## 2026-09-15T09:23:38Z

You are Worker M2 (Diverse Entities, AI Variants & 3-Tier Overhead UI) on the Bomberman project in /Users/user/src/bomberman.
Your working directory is: /Users/user/src/bomberman/.agents/worker_expansion_m2_entities

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY READING:
You MUST read:
1. /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
2. /Users/user/src/bomberman/PROJECT.md
3. /Users/user/src/bomberman/.agents/explorer_expansion_entities/handoff.md
4. /Users/user/src/bomberman/tests/entities_expansion.test.mjs

OBJECTIVES & REQUIREMENTS:
Implement modular entity architecture in `src/game/entities/` and wire into `src/game/GameScene.ts`:
1. Modular Entity Architecture in `src/game/entities/`:
   - `OverheadUI.ts`: 3-Tier Overhead UI component for entities.
     - Tier 1: Segmented HP bar at y - 14 (width 24px, height 4px, segmented by maxHp, colored per archetype palette).
     - Tier 2: Name tag text at y - 22 (e.g. "Chaser: Blinky", "#fb923c" for enemy, "#22d3ee" for ally, "#fbbf24" for neutral).
     - Tier 3: Intent badge / emoji indicator at y - 34 (e.g. "!", "⚠️", "⚡", "💫", "💨", "🛡️", "💣", etc.).
     - Clean lifecycle methods: `update(x, y, currentHp)`, `setIntent(glyph, visible)`, `destroy()`.
   - `types.ts`: Factions (`player`, `enemy`, `neutral`, `ally`), entity archetypes constants (`ENEMY_ARCHETYPES`, `NEUTRAL_ARCHETYPES`, `ALLY_ARCHETYPES` matching `tests/entities_expansion.test.mjs`).
   - `BaseEntity.ts`: Base class or composite managing sprite, faction, hp/maxHp, i-frames (`invulnerableTimer`), stun state, movement speed, and OverheadUI instance.
   - `EnemyEntities.ts`:
     - Chaser: Fast tracking, 350ms windup before 240 px/s corridor dash, 900ms stun on wall impact, 1 HP.
     - Bomber: Strategic bomb planting via escape BFS safety checks, 2 HP, enraged mode at 1 HP (1200ms quick fuse bombs).
     - Tank: 4 HP, 1200ms i-frames per hit, bulldozes `TILE_BLOCK` (soft blocks) upon collision, ground stomp slowing player.
     - Ghost: 1 HP, phases through `TILE_BLOCK` soft walls, can phase-dash at player, materializes for 1500ms after dash.
     - Splitter: 2 HP parent, upon defeat intercepts destroy to spawn 2 mini-slimes (1 HP, fast scatter) at adjacent orthogonal tiles.
   - `NeutralEntities.ts`:
     - Wandering Merchant ("Pops"): 3 HP, peaceful walk, flees ticking bombs, pauses at intersections for trade cart (`[E] Trade`), drops 2 protected power-ups on death.
     - Wandering Critter ("Fluff"): 1 HP, peaceful waddle, harmless to player, 25% chance to distract hunting enemies, grants +200 score on defeat.
   - `AllyEntities.ts`:
     - Mini-Bomber Buddy ("Pom-Pom"): 3 HP, dynamic leash following player (2-6 tiles), drops bombs ONLY when player is outside blast danger zone (ZERO friendly fire!), flees safely.
     - Pet Drone ("Gizmo"): 2 HP, flies over obstacles, orbits player, vacuums power-up items within 6 tiles, peashooter stun bolt at enemies every 3s.
     - Shield Guard ("Aegis"): 5 HP, walks 1 tile ahead of player, periodic taunt aura (forces enemies within 5 tiles to target Aegis), dome shield absorbing explosions near player.
   - `index.ts`: export all entities and helper factories.

2. Integration into `src/game/GameScene.ts`:
   - Wire the 3-Tier Overhead UI for all spawned entities (and player if applicable).
   - Wire spawning and lifecycle for diverse enemy types, neutral NPCs, and allies.
   - Update collision and damage matrix:
     - Player/Ally explosions deal ZERO damage to Player or Allies (strict friendly-fire immunity!).
     - Enemy explosions deal ZERO damage to Enemies.
     - Multi-hit entities respect i-frame timers (e.g. 800-1200ms) with visual sprite flashing so a single explosion doesn't multi-hit in 1 frame.
     - Ensure clean garbage collection on entity death (`ui.destroy()`, physics body cleanup).

VERIFICATION:
Run and verify passing:
- `node --test tests/entities_expansion.test.mjs`
- `npm test` (all 241+ tests must pass with 0 failures!)
- `npm run lint`
- `npm run build`

DELIVERABLE:
Write detailed `handoff.md` in `/Users/user/src/bomberman/.agents/worker_expansion_m2_entities/handoff.md` with:
- Files modified/created
- Verification test outputs
- Any caveats or interface details
Then send a completion message back to orchestrator.
