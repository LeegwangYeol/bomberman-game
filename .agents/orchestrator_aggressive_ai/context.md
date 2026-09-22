# Orchestrator Context — Aggressive Enemy AI Rewrite

## Request
Rewrite the enemy AI in the Bomberman codebase to be highly aggressive. Enemies must actively destroy blocks to expand their territory and aggressively hunt, corner, and attack the player.

Working directory: `/Users/user/src/bomberman`
Integrity mode: `development`

## Requirements
### R1. Aggressive Territory Expansion
Modify the core enemy AI (e.g., `ChaserEnemy`, `BomberEnemy`) so they no longer just wander randomly. They must actively identify destructible blocks blocking their path and strategically place bombs to destroy them and open up the map.

### R2. Relentless Player Hunting & Attacking
Implement advanced hunting logic. Enemies should track the player's position, attempt to corner them, and place bombs offensively to trap the player. Ensure they still possess self-preservation logic (running away from bomb blasts).

## Acceptance Criteria
- [ ] Enemy AI files (e.g., in `src/game/entities/`) are updated with the new aggressive block-destroying and pathfinding logic.
- [ ] A test suite (`tests/aggressive_ai.test.mjs`) is added or updated, proving that enemies actively place bombs to break blocks and reduce distance to the player over time.
- [ ] The game builds successfully and 0 lint errors exist.
