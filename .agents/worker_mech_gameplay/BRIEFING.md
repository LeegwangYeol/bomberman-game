# BRIEFING — 2026-09-15T04:30:00Z

## Mission
Implement Milestone 3: Dynamic Gameplay (Items, Skills, Gimmicks) & React HUD Bridge in Bomberman.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa
- Working directory: /Users/user/src/bomberman/.agents/worker_mech_gameplay
- Original parent: 44588999-8c10-421d-bf21-ce8f01b21f6e
- Milestone: M3 (dynamic_gameplay)

## 🔒 Key Constraints
- DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations.
- Export `PlayerStats` interface in `GameScene.ts`.
- 45% drop rate on block destruction with 600ms grace period protecting new drops from initial blast.
- Stat caps: Speed Up (+25 px/s, cap 250), Bomb Up (+1, cap 8), Fire Up (+1, cap 8).
- Skills: Bomb kick (sliding physics), Dash (350 px/s burst for 140ms, i-frames, 3.5s CD), Shield (absorbs 1 fatal hit).
- Gimmicks: Conveyor belts (60 px/s drift), Teleport portals (warp with cooldown).
- React HUD: real-time gauges via `game.events.emit('stats-update')` and mobile `[DASH]` virtual button.
- Clean `npm test` and `npm run build` (Turbopack exit 0).

## Current Parent
- Conversation ID: 44588999-8c10-421d-bf21-ce8f01b21f6e
- Updated: 2026-09-15T04:30:00Z

## Task Summary
- **What to build**: Full item drop/pickup system, player skills, map gimmicks, event-driven React HUD bridge and mobile controls extension.
- **Success criteria**: All items drop and apply bounded stat mutations; skills and gimmicks function correctly; HUD updates in real-time; all tests pass; build succeeds.
- **Interface contracts**: `PROJECT.md` § Interface Contracts.
- **Code layout**: `PROJECT.md` § Code Layout.

## Change Tracker
- **Files modified**:
  - `src/game/gameplay_mechanics.ts` (created pure mechanics engine, constants, drop tables, stat mutators, kick & portal simulation)
  - `src/game/GameScene.ts` (integrated PlayerStats, procedural item textures, item drops with 600ms grace, pickups with caps, bomb kick, dash, shield, gimmicks, stats-update emitter)
  - `src/components/BombermanGame.tsx` (game.events listener, Retro Arcade HUD gauges & badges, mobile [DASH] button)
  - `tests/dynamic_gameplay.test.mjs` (24 comprehensive tests across 8 suites)
- **Build status**: PASS (120/120 tests pass, Next.js Turbopack build exit code 0, ESLint 0 errors / 0 warnings)
- **Pending issues**: None

## Quality Status
- **Build/test result**: 120/120 tests pass (`npm test`), Next.js `npm run build` exits 0.
- **Lint status**: 0 errors, 0 warnings (`npm run lint`).
- **Tests added/modified**: 24 tests added in `tests/dynamic_gameplay.test.mjs`.

## Key Decisions Made
- Extracted deterministic drop tables and physics simulation helpers into `src/game/gameplay_mechanics.ts` to enable strict unit testing in Node while keeping Phaser rendering cleanly separated.
- Procedural item textures generated via Canvas / Graphics API with emoji glyphs ensuring zero 404 image errors.
- 600ms explosion grace period check uses `isItemProtectedFromExplosion(spawnTime, now)` in physics overlap to prevent immediate blast suicide.
- Dash skill applies burst speed of 350 px/s with 3 ghost afterimages and 140ms i-frames.
- Shield skill absorbs 1 lethal contact (bomb or enemy) and provides 1500ms blinking invulnerability.
- Conveyor belt provides 60 px/s drift; Teleport portals warp between (1,13) and (11,1) with 1200ms debounce.
- React HUD receives real-time `stats-update` events with complete teardown on unmount.

## Artifact Index
- `.agents/worker_mech_gameplay/BRIEFING.md` — Agent briefing & state tracking
- `.agents/worker_mech_gameplay/progress.md` — Progress log & heartbeat
