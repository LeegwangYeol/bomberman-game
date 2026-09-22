## 2026-09-22T07:56:09Z

Massively overhaul the "game feel" and graphical "juice" of the Bomberman game. Fix the UI floating text/name tag issues. MOST IMPORTANTLY, fix the enemy AI so they ACTUALLY aggressively destroy blocks and hunt the player in real-time gameplay, since the previous AI update failed to manifest in the live game. Use a very large team of agents to brainstorm and implement these upgrades.

### R1. REAL Aggressive Enemy AI (CRITICAL FIX)
The previous AI update failed in real gameplay. Enemies must ACTUALLY place bombs to destroy soft blocks blocking their path, and they must ACTUALLY hunt and corner the player aggressively. Fix whatever logic is preventing them from executing their pathfinding and demolition logic in the live `GameScene`. Thoroughly inspect why the previous pathfinding/demolition logic wasn't executing in the active `GameScene` loop and fix it completely.

### R2. UI Depth & Text Occlusion Fix (CRITICAL)
Fix the horrendous name tag overlap bugs. Floating text (like enemy names) must NEVER completely cover characters or overlap with each other in an unreadable mess. Implement proper text occlusion, dynamic repositioning, or opacity fading when entities are clustered. Ensure Z-indexing is correct so entities are always visible.

### R3. Massive "Juice" & Animation Upgrade
Implement industry-standard "game feel" mechanics:
- Squash-and-stretch tweening to character/enemy movements (or bobbing tweens replacing static sliding).
- Pulsing animations to bombs.
- Screen shake & hit-stop (frame freeze) during explosions.
- Rich particle emitters (dust when walking, sparks for bombs, debris for block destruction).
- Dynamic drop shadows under all entities, blocks, and items.

## Acceptance Criteria
- [ ] In actual live gameplay, enemies are observed actively placing bombs next to soft blocks to destroy them and create paths.
- [ ] Floating name tags dynamically avoid overlapping characters and other text, or fade out appropriately when clustered.
- [ ] Entities (player, enemies) utilize squash/stretch or bobbing tweens during movement, replacing static sliding.
- [ ] Explosions trigger screen shake and spawn particle emitters for debris/fire.
- [ ] The game builds successfully with 0 lint errors, and 100% of existing tests still pass.
