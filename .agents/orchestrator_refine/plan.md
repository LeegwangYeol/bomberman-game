# Execution Plan: Bomberman Prototype Refinement

## Context & Objectives
- Workspace: `/Users/user/src/bomberman`
- Requirements:
  1. R1: Smooth Player Movement (corner sliding & physics body hitbox tuning to prevent snagging)
  2. R2: Lively Enemies (visual AI states: idle, moving, hunting, dynamic scaling/animations, particles/indicators)
  3. R3: Dynamic Bomb Animations (pulsing/scaling tween while ticking, explosion impact)
- Acceptance Criteria:
  - Physics/corner-sliding eliminates snagging
  - Visual indication of enemy AI states
  - Bomb ticking tween
  - 0 build errors (`npm run build`), 0 test failures (`npm test`), 0 lint errors (`npm run lint`)

## Phases & Milestones

### Phase 0: Survey & Investigation (Parallel)
- Dispatch 3 Explorers:
  1. `explorer_movement`: Inspect `GameScene.ts`, `BombermanGame.tsx`, physics body setup, velocity handling, collision geometry, tile size, and corner-sliding possibilities.
  2. `explorer_enemies`: Inspect enemy definitions in `GameScene.ts`, `pathfinding.ts`, current AI states (patrol, hunt, etc.), sprite rendering, visual indicators, animation hooks.
  3. `explorer_bombs_tests`: Inspect bomb creation, ticking timer, sprite representation, tweens, explosion logic, and existing tests in `tests/`.

### Phase 1: Implementation (Specialist Workers)
- Dispatch Workers to apply precise, modular changes:
  1. Player movement & corner-sliding implementation + hitbox sizing.
  2. Enemy state animations/visual indicators (idle/moving/hunting) & dynamic feedback.
  3. Bomb pulse/ticking tweens & explosion particle/impact enhancements.
  4. Ensure build and tests pass.

### Phase 2: Independent Review & Adversarial Challenge
- Dispatch Reviewers (`teamwork_preview_reviewer` x2) to independently verify code quality, regressions, and acceptance criteria.
- Dispatch Challengers (`teamwork_preview_challenger` x2) to author automated tests stress-testing corner sliding, enemy state transitions, and bomb tweens.

### Phase 3: Forensic Integrity Audit & Gate
- Dispatch Auditor (`teamwork_preview_auditor`) to verify zero cheats, genuine logic, clean build (`npm run build`), passing tests (`npm test`), and lint clean (`npm run lint`).
- Evaluate Gate criteria (all APPROVE, clean audit).
- Output final handoff report.
