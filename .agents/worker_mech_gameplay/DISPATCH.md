# Dispatch: Worker Milestone 3 — Dynamic Gameplay (Items, Skills, Gimmicks) & React HUD Bridge

## Mission
Implement core power-up items (Speed Up, Bomb Up, Fire Up, Kick, Shield) with 600ms blast grace period, player skills (Bomb Kick, Dash, Shield), map gimmicks (Conveyor belts, Teleport Portals), and the real-time React HUD bridge.

## References
- `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/.agents/explorer_mech_gameplay/handoff.md`

## Owned Files
- `src/game/GameScene.ts` (Items group, drop on destroyBlock, 600ms grace, pickup overlap, playerSpeed promotion, bomb kick, dash skill, shield, conveyor drift, portals, stats-update emitter)
- `src/components/BombermanGame.tsx` (game.events listener, real-time Retro Arcade HUD, stats display, Dash mobile button)
- `tests/dynamic_gameplay.test.mjs`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Requirements & Implementation Blueprint
1. In `src/game/GameScene.ts`:
   - Export `PlayerStats` interface.
   - Generate procedural textures for items in `preload()` or `create()` (`item_speed`, `item_bomb`, `item_fire`, `item_kick`, `item_shield`) using canvas/graphics to guarantee 100% reliable rendering without missing image files.
   - Item drops in `destroyBlock()`:
     - 45% drop probability with weighted roll: Bomb Up (40%), Fire Up (40%), Speed Up (20%), Kick (special), Shield (special).
     - Store in `this.items = this.physics.add.group()`.
     - Record `spawnTime = this.time.now`.
     - In explosion vs item overlap: only incinerate item if `this.time.now - item.getData('spawnTime') > 600` (600ms grace window).
     - In player vs item overlap: apply stat upgrades:
       - Speed Up: +25 px/s (cap 250 px/s, speedLevel up to 5)
       - Bomb Up: +1 max bomb (cap 8)
       - Fire Up: +1 radius (cap 8)
       - Kick: unlock `hasKick = true`
       - Shield: activate `hasShield = true`
       - Emit `stats-update`.
   - Skills:
     - Bomb Kick: If `hasKick`, moving into a bomb slides it at 300 px/s in heading direction until hitting wall/block/bomb.
     - Dash: Key Shift/E or `mobileInput.dash`: 350 px/s burst for 140ms, i-frames, 3.5s cooldown.
     - Shield: Absorbs 1 lethal hit (explosion or enemy touch), consumes shield, grants 1.5s i-frames.
   - Gimmicks:
     - Conveyor belt tiles on center corridor pushing entities by 60 px/s.
     - Paired Teleport Portals with 1.2s warp cooldown.
   - Event Bridge:
     - Emit `this.game.events.emit('stats-update', stats)` on init, pickup, bomb drop/explode, and skill changes.
2. In `src/components/BombermanGame.tsx`:
   - Listen to `stats-update` event from `game.events`.
   - Render rich Retro Arcade HUD in header/bezel:
     - Bombs gauge (`active / max`)
     - Fire level (`Lv. {power}`)
     - Speed gauge (`{speed} px/s (Lv. {level})`)
     - Skill badges: Dash meter, Kick unlocked icon, Shield status
     - Item collection summary counters
   - Add `[DASH]` virtual button to mobile controls next to `[BOMB]`.
3. Create `tests/dynamic_gameplay.test.mjs`:
   - Test item drop probability distribution and weights across 1,000 rolls.
   - Test stat upgrade capping (speed clamped at 250, max bombs at 8, fire power at 8).
   - Test 600ms explosion protection grace period.
   - Test bomb kick slide velocity and tile snapping.
   - Test dash cooldown and invulnerability state.
   - Test conveyor drift velocity.
   - Test portal teleportation and debounce cooldown.
   - Test `stats-update` event structure.
4. Run `npm test` (all tests pass) and `npm run build` (Next.js Turbopack exits code 0).
5. Write handoff report to `/Users/user/src/bomberman/.agents/worker_mech_gameplay/handoff.md`.

## 2026-09-15T04:29:35Z
You are worker_mech_gameplay, a Worker subagent in the Bomberman project.
Your working directory is: /Users/user/src/bomberman/.agents/worker_mech_gameplay
Implement Milestone 3:
1. In `src/game/GameScene.ts`:
   - Export `PlayerStats` interface.
   - Generate procedural textures for items (`item_speed`, `item_bomb`, `item_fire`, `item_kick`, `item_shield`) so no missing image files occur.
   - Implement item drops in `destroyBlock()` with 45% drop rate, floating tweens, and a 600ms grace window preventing immediate blast incineration.
   - Implement item pickups with stat mutations and caps: Speed Up (+25 px/s, cap 250), Bomb Up (+1, cap 8), Fire Up (+1, cap 8), Kick, Shield.
   - Implement player skills: Bomb Kick (sliding bomb until obstacle), Dash (burst speed + i-frames on 3.5s CD), Shield (absorbs 1 fatal hit).
   - Implement map gimmicks: Conveyor belts (push drift) and Teleport Portals (warp with cooldown).
   - Implement event emitter: `this.game.events.emit('stats-update', stats)`.
2. In `src/components/BombermanGame.tsx`:
   - Connect to `stats-update` event on `game.events` and render a rich Retro Arcade HUD displaying real-time gauges for bombs, fire power, speed, active skills, and collected item counts.
   - Add a `[DASH]` virtual button to the mobile controls alongside `[BOMB]`.
3. Create `tests/dynamic_gameplay.test.mjs` verifying item drop distributions, caps, 600ms grace, kick physics, dash CD, conveyor/portal, and HUD bridge interface.
4. Run `npm test` and `npm run build` to verify that all tests pass and build succeeds with exit code 0.
5. Write your handoff report to `/Users/user/src/bomberman/.agents/worker_mech_gameplay/handoff.md`.
When complete, send a message to parent notifying completion.
