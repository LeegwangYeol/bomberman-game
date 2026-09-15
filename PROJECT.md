# Project: Bomberman Mechanics, Animations & Dynamic Gameplay Expansion

## Architecture
- **Engine**: Phaser 3 (Arcade Physics) + Next.js (React 19 + TypeScript).
- **Scene**: `src/game/GameScene.ts` managing entities, animations, tilemaps, physics, and event dispatch.
- **AI & Pathfinding**: `src/game/pathfinding.ts` discrete BFS grid navigation, blast raycasting, and escape route calculation.
- **Dynamic Gameplay**: `src/game/gameplay_mechanics.ts` drop tables, stat mutators, grace window, slide physics.
- **UI & HUD**: `src/components/BombermanGame.tsx` retro arcade cabinet layout, responsive virtual d-pad/action buttons, real-time HUD gauges, and decoupled event bridge.
- **Assets**: `public/assets/` SVG-to-PNG procedural generation pipeline in `scripts/generate-assets.sh`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 120x160 Player Spritesheet | 12-frame spritesheet (Down, Up, Side/Profile, Defeat) via SVG generator | M1 | DONE |
| 2 | Directional Walk Cycles | Phaser walk animations (Down, Up, Side with flipX mirror for Left) | M1 | DONE |
| 3 | Idle Direction Preservation | Player preserves facing direction when movement stops | M1 | DONE |
| 4 | Defeat Animation | Dizzy/stun visual sequence upon player elimination | M1 | DONE |
| 5 | Blast Prediction & Escape BFS | `getBlastTiles()` and `findEscapePathBFS()` in `pathfinding.ts` | M2 | DONE |
| 6 | Enemy Bomb Placement | Strategic bomb placement when near player/block with safe escape verification | M2 | DONE |
| 7 | Enemy Evading State | `EnemyState.EVADING` fleeing to computed safe tile at evasion speed | M2 | DONE |
| 8 | Enemy Name Tags | Stylized 2-tier overhead UI (Name Tag at y-19, Intent at y-33) | M2 | DONE |
| 9 | Core Power-Up Items | Block destruction drops: Speed Up (+25px/s), Bomb Up (+1), Fire Up (+1) | M3 | DONE |
| 10 | Item Drop Grace Period | 600ms blast invulnerability so breaking bomb doesn't incinerate item | M3 | DONE |
| 11 | Player Skills & Gimmicks | Bomb Kick (sliding bomb physics), Dash (burst + i-frames), Conveyor & Portals | M3 | DONE |
| 12 | React-Phaser HUD Bridge | Event-driven bridge emitting `stats-update` to React arcade HUD | M3 | DONE |
| 13 | Real-Time HUD UI | Display bombs (active/max), fire level, speed, skills & item counts | M3 | DONE |
| 14 | Comprehensive Automated Tests | 154 tests across 11 suites covering all mechanics & stress vectors | M4 | DONE |
| 15 | Adversarial & Forensic Audit | Reviewers (APPROVE), Challengers (APPROVE), Forensic Auditor (CLEAN) | M5 | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Directional Animations & Spritesheet | `scripts/generate-assets.sh`, `public/assets/player.png`, `GameScene.ts` anims & facing | Survey done | DONE |
| M2 | Advanced Enemy Bomb Placement & Name Tags | `pathfinding.ts` escape BFS, `GameScene.ts` enemy bomb placement & overhead name tags | M1 | DONE |
| M3 | Dynamic Gameplay & React HUD Bridge | `GameScene.ts` items, drop tables, skills, gimmicks, `BombermanGame.tsx` HUD | M2 | DONE |
| M4 | Comprehensive Integration Test Suites | 154 tests in `tests/*.test.mjs` | M3 | DONE |
| M5 | Adversarial Verification & Forensic Audit | Reviewers, Challengers, Forensic Integrity Audit (CLEAN) | M4 | DONE |

## Interface Contracts
### `GameScene.ts` ↔ `pathfinding.ts`
- `getBlastTiles(center: GridCoord, power: number, map: number[][]): Set<string>`
- `findEscapePathBFS(start: GridCoord, dangerTiles: Set<string>, map: number[][], bombTiles: Set<string>, maxSteps?: number): GridCoord[] | null`

### `GameScene.ts` ↔ `BombermanGame.tsx`
- Event: `'stats-update'`
- Payload: `PlayerStats` (speed, speedLevel, maxBombs, activeBombs, bombPower, hasKick, hasShield, dashCooldownRemaining, itemsCollected, score, isGameOver)
- Mobile Input state: `window.mobileInput` (`up, down, left, right, bomb, dash`)
