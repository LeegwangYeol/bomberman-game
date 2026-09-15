# Orchestration Plan: Bomberman Mechanics, Animations & Dynamic Gameplay

## 1. Objectives & Scope
- **R1: Directional Character Animations**:
  - Implement fluid directional animations (up, down, left, right) for player sprite.
  - Idle state preservation, buttery smooth velocity/heading transitions.
- **R2: Advanced Enemy Behavior & UI**:
  - Strategic bomb placement logic for enemies in pathfinding/GameScene.
  - Safe detonation & fire propagation without infinite loops or self-harm crashes.
  - Distinct name tags (cute/menacing identity labels) hovering over enemies.
- **R3: Dynamic Gameplay & HUD**:
  - Power-up item drop system from destroyed blocks (Speed Up, Bomb Up, Fire Up).
  - Player skills (bomb kick/punch, dash, or shield) and dynamic map gimmicks (conveyor belts, portals).
  - React HUD in `BombermanGame.tsx` reflecting real-time stats and active skills.
- **Verification & Acceptance**:
  - Unit/integration test suites passing 100%.
  - `npm run lint` and `npm run build` pass with 0 errors.
  - Forensic integrity audit clean.

## 2. Multi-Agent Team Structure
1. **Survey Phase (Parallel Explorers)**:
   - `explorer_mech_anim`: Inspect current sprite loading, player movement, and animation mechanisms in `GameScene.ts` and `public/assets/`.
   - `explorer_mech_ai`: Inspect `pathfinding.ts`, enemy FSM, bomb placement opportunities, and overhead text rendering.
   - `explorer_mech_gameplay`: Inspect block destruction, item drops, player stats/skills, map gimmicks, and React HUD bridge in `BombermanGame.tsx`.
2. **Implementation Phase (Workers)**:
   - Decomposed milestones with strict file write boundaries.
3. **Verification Phase (Challengers & Reviewers)**:
   - Extensive test suite covering all new mechanics.
4. **Audit Phase (Forensic Auditor)**:
   - Strict integrity forensics against hardcoding or facades.
