## 2026-09-15T04:12:20Z

You are the Project Orchestrator for the Bomberman mechanics, animation, and dynamic gameplay expansion project.

## Your Working Directory
`/Users/user/src/bomberman/.agents/orchestrator_mechanics`
Maintain your `plan.md`, `progress.md`, and `context.md` in this directory. Keep `progress.md` updated frequently as your pulse for sentinel monitoring.

## User Request Reference
The authoritative request is recorded in `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md` (and `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`).
Collaboration notes are in `/Users/user/src/bomberman/COLLABORATION.md`.

## Detailed Requirements

### R1. Directional Character Animations
Implement fluid directional animations (up, down, left, right) for the player character using proper sprite sheets or distinct directional assets, so the character actively looks where they are moving. Ensure transitions are buttery smooth. If generating/using sprite assets or canvas/procedural directional frames, ensure they fit the aesthetic and cleanly switch on velocity/heading with idle preservation.

### R2. Advanced Enemy Behavior & UI
Upgrade enemy AI so they can strategically place bombs to trap the player. Ensure enemy-placed bombs detonate, spawn fire, and interact with the world normally without crashing or causing infinite loops. Add distinct name tags hovering over enemies to give them identity (e.g., stylized text label with cute or menacing names positioned cleanly above the sprite).

### R3. Dynamic Gameplay (Items, Skills, Gimmicks)
Introduce core Bomberman items (power-ups like Speed Up, Bomb Up, Fire Up) that drop from destroyed blocks with balanced drop rates. Add player skills (e.g., bomb kick/punch, dash, or shield) and dynamic map gimmicks (e.g., conveyor belts that push entities, teleportation portals, or springboards). Update the HUD/UI in `BombermanGame.tsx` to display collected items, real-time stats (speed, bomb capacity, blast range), and active/cooldown skills.

## Acceptance Criteria
- [ ] The player sprite updates its visual frame/animation based on the current movement direction (up, down, left, right).
- [ ] Enemies have logic to place bombs, and those bombs detonate and interact with the world normally.
- [ ] Enemies render a text label (name tag) above their sprites.
- [ ] At least 3 distinct power-up items can be collected by the player, dynamically updating their stats (speed, bomb limit, blast radius).
- [ ] The game HUD correctly reflects the player's current item stats and skills.
- [ ] The game builds successfully with 0 errors (`npm run build`).

## Orchestration Strategy
The user specifically requested: "Use a very large team of agents to thoroughly develop, test, and audit these massive additions."
Decompose this massive task into parallel specialized subagents:
- Explorers for codebase architecture, asset pipeline, enemy AI & pathfinding, item drop systems, and UI bindings.
- Workers/Implementers for:
  1. Directional animation sprites & frame management in `GameScene.ts`.
  2. Enemy bomb placement logic & name tags in `pathfinding.ts` and `GameScene.ts`.
  3. Item drop tables, power-up pickup logic, player skills, and dynamic map gimmicks (conveyor belts, portals).
  4. React HUD and state bridge in `BombermanGame.tsx`.
- Reviewers and Challengers for code quality, edge cases, physics/trapping bugs, and performance.
- Automated test suites (e.g., unit/stress tests in `tests/`) verifying all item mechanics, enemy bomb placement, and animation states.
- Ensure `npm run lint` and `npm run build` pass with 0 errors.

When all work is verified and complete, write `handoff.md` in your directory and report completion back to the Sentinel.
