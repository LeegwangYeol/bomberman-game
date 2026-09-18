# Progress — Physics & Collision Inspector

- Last visited: 2026-09-18T09:43:00Z
- Status: Deep investigation complete; drafting findings.md and handoff.md
- Current focus: Writing comprehensive physical error analysis across all 5 assigned areas

## Key Discoveries Made:
1. [P1] Permanent God-Mode Bug on Extra Life Revival (`GameScene.ts:2623-2631`): `isInvulnerable` is never cleared to false after extra life revives.
2. [P1] Captured Placement Coordinates in Bomb Detonation (`GameScene.ts:2231, 2319`): Fuse timer captures initial placement (row, col) in closure; kicked or conveyor-drifted bombs detonate at phantom initial coordinates instead of current resting tile!
3. [P2] Conveyor Single-Point Edge Jitter (`GameScene.ts:1727-1733`): Only checks center point `Math.floor(nextX/40)`; 24x24 player and 32x32 bomb hitboxes penetrate up to 12px/16px into solid walls, fighting Arcade Physics collider every frame.
4. [P2] Diagonal Blast Leakage / Corner Clipping (`GameScene.ts:2470-2495`): Explosion sprites have 40x40 physics bodies extending to tile borders; corner-sliding entities intersect explosion AABB diagonally around solid pillars.
5. [P3] Soft Block Desync in Simultaneous Blasts (`GameScene.ts:2444-2450, 2526`): First bomb destroys block and mutates `map[r][c] = TILE_EMPTY` synchronously; subsequent simultaneous/chain bomb rays don't stop and pierce through the destroyed block.
6. [P3] Single Bomb Multi-Hit Boss Exploit (`GameScene.ts:2499-2508`): Multiple explosion tiles from a single bomb each call `takeBombDamage`, depleting 2-3 HP per bomb instead of 1.
7. [P4] Ignored Progression `cornerSlideTolerance` & ±3px Dead Zone (`GameScene.ts:2115-2125`): Meta-progression perk `corner_magnet` is never wired to movement; 6px dead zone causes snagging when approaching turns centrally.
8. [P4] Passability Desync with `WALL_PASS` and `BOMB_PASS` (`GameScene.ts:2042-2061`): `isPassable()` returns false for blocks and bombs regardless of pass perks, corrupting corridor centering and corner rounding.

