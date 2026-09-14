# Project: Bomberman Prototype Implementation

## Architecture
- **Framework**: Next.js 16.3.5 (Turbopack) + React 19 + TypeScript + Tailwind CSS v4.
- **Game Engine**: Phaser 4.2.1 ("Giedi") with Arcade Physics.
- **Rendering Pipeline**:
  - Full-screen scenic backdrop: `background.png` (800x600 px) pinned via `setScrollFactor(0)` at depth -10.
  - Centered playfield ($13 \times 15$ grid of 40x40 px tiles) centered via camera scroll (-100, -40).
  - Preloaded image assets: `player.png`, `enemy.png`, `enemy_tracker.png`, `bomb.png`, `explosion.png`, `wall.png`, `block.png`, `floor.png`, `background.png` in `/public/assets/`.
- **Enemy AI System**:
  - Grid-based Breadth-First Search (BFS) pathfinding on discrete $13 \times 15$ map navigating around walls and blocks with Manhattan distance fallback.
  - Waypoint corridor alignment snapping orthogonal coordinates to eliminate corner-snagging.
  - 4-Stage Attack State Machine:
    * `TRACKING`: Moves along BFS path toward player at 75 px/s.
    * `WINDUP`: Line-of-sight trigger, stops and telegraphs attack with red alert tint for 450ms.
    * `ATTACK`: High-speed charge dash at 200 px/s along locked corridor direction.
    * `COOLDOWN`: Recovery state for 1200ms with blue tint allowing tactical player retaliation.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Real Image Assets (.png) | 9 RGBA PNG assets for player, enemies, bombs, explosion, wall, block, floor, background | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Phaser Preload Integration | `preload()` loading all 9 assets via `this.load.image()` | M2 | ORIGINAL_REQUEST §R1 |
| 3 | Background & Depth Layering | Pinned scenic background and explicit Z-depth sorting for all entities | M2 | ORIGINAL_REQUEST §R1 |
| 4 | BFS Player Tracking AI | Dynamic obstacle-avoiding BFS pathfinder with nearest-frontier fallback | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Enemy Attack State Machine | 4-stage FSM (Tracking -> Windup -> Charge Attack -> Cooldown) | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Corridor Alignment Physics | Waypoint snapping and tuned hitboxes (28x28) to eliminate corner snagging | M2 | ORIGINAL_REQUEST §R2 |
| 7 | UI & Control Polish | Retro cute UI styling in BombermanGame.tsx, fixing NippleJS and GameScene TypeScript any types | M3 | ORIGINAL_REQUEST §R1, R3 |
| 8 | Multi-Agent Review & Challenge | 2 Reviewers + 2 Challengers checking code quality, edge cases, and build | M4 | ORIGINAL_REQUEST §R3 |
| 9 | Forensic Integrity Audit | Independent teamwork_preview_auditor verifying authentic implementation and zero hardcoding | M5 | ORIGINAL_REQUEST §R3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Asset Generation | Generate 9 PNG assets in `public/assets/` | none | DONE |
| M2 | GameScene & AI | Preload PNGs, depth layering, BFS tracking & attack FSM in `GameScene.ts` | M1 | DONE |
| M3 | UI & Component Polish | HUD & container polish, fix TypeScript `any` types in `BombermanGame.tsx` | M2 | DONE |
| M4 | Review & Adversarial Challenge | 2 Reviewers + 2 Challengers empirical verification | M2, M3 | DONE |
| M5 | Forensic Integrity Audit | Teamwork forensic auditor for authenticity verification | M4 | DONE |

## Code Layout
- `public/assets/`: All game sprite and background PNG assets.
- `src/game/GameScene.ts`: Phaser scene, preload, rendering, physics, enemy AI FSM, bomb logic.
- `src/game/pathfinding.ts`: Pure grid BFS pathfinder and bomb avoidance.
- `src/components/BombermanGame.tsx`: React wrapper, UI controls, HUD, NippleJS touch controls.
- `tests/`: Automated unit and empirical stress tests (25 tests passing).
