# Execution Plan — Aggressive Enemy AI Rewrite

## Objectives
Rewrite enemy AI to be aggressive in two core ways:
1. **R1. Aggressive Territory Expansion**:
   - Enemies identify destructible blocks (soft blocks) blocking their path towards the player or territory expansion.
   - Enemies strategically place bombs to destroy blocks, open up paths, and expand accessible map space.
2. **R2. Relentless Player Hunting & Attacking**:
   - Advanced hunting: track player's position, corner them, trap them with offensive bomb placement.
   - Self-preservation: maintain safe blast escape paths (do not commit suicide while placing offensive bombs).
3. **Acceptance & Quality**:
   - Updated enemy AI in `src/game/entities/` and pathfinding helpers if needed.
   - Comprehensive test suite `tests/aggressive_ai.test.mjs` verifying enemies actively destroy blocks and reduce distance to player over time.
   - 100% tests passing, 0 lint errors, build succeeds (`npm run build`).

## Phased Approach
- **Phase 1: Exploration**:
  - Dispatch 3 parallel Explorers:
    - Explorer 1: Inspect `src/game/entities/` (Base Enemy, ChaserEnemy, BomberEnemy, TankEnemy, etc.) to understand current AI states, decision trees, movement speeds, and update loops.
    - Explorer 2: Inspect `src/game/pathfinding.ts`, `ZeroGCPathfinder.ts`, escape path calculations, tile evaluations, and block detection.
    - Explorer 3: Inspect existing test harnesses in `tests/`, mock scene setup, bomb explosion timing, block destruction triggers, and requirements for `tests/aggressive_ai.test.mjs`.
- **Phase 2: Synthesis & SCOPE.md**:
  - Consolidate explorer findings.
  - Finalize exact algorithmic design:
    - Pathfinding that treats destructible blocks as breakable obstacles rather than hard walls when searching for the player.
    - Block destruction heuristic: if path to player is blocked by soft blocks, target the blocking soft block, navigate adjacent to it, place bomb if safe escape exists, evade until detonation, then proceed.
    - Hunting & cornering heuristic: predict player movement corridor, place offensive bombs at choke points.
- **Phase 3: Worker Implementation**:
  - Worker writes code to `src/game/entities/` and supporting files.
  - Worker creates/updates `tests/aggressive_ai.test.mjs`.
  - Worker executes `npm test`, `npm run lint`, and `npm run build`.
- **Phase 4: Multi-Agent Gate**:
  - 2 Reviewers independently evaluate code quality and correctness.
  - 2 Challengers run adversarial checks.
  - 1 Forensic Auditor verifies zero cheating, no hardcoded test stubs.
- **Phase 5: Gate Clearance & Reporting**:
  - Record verdicts in `GATE_STATUS.md`.
  - Update `COLLABORATION.md`.
  - Send victory report to parent.
