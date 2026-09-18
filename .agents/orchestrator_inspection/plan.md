# Inspection & Remediation Plan — 총검사 (Total Inspection)

## Goal
Perform an exhaustive inspection of the entire Bomberman codebase across all physical, logical, visual, and architectural dimensions, identify all latent bugs, glitches, memory leaks, and edge cases, and execute autonomous remediation with permanent defensive tests.

## Domains of Inspection
1. **Physics, Collision & Movement**:
   - Player corridor snagging and corner sliding responsiveness.
   - Bounding box offsets: player (24x24 in 40x40 tile), bombs (32x32), blocks (40x40), enemies.
   - Bomb kicking trajectories, sliding speed, collision with soft/hard blocks and enemies.
   - Blast raycasting: penetration checks for soft vs hard blocks, barrier/shield penetration, multi-bomb detonation order.
   - Conveyor belt momentum, portal teleportation drift and oscillation guards.
2. **AI, Pathfinding & FSM**:
   - `ZeroGCPathfinder` and BFS boundary checks, coordinate clamping, out-of-bounds guards.
   - Suicide-prevention invariant: escape path finding before bomb drop.
   - Enemy clipping into solid blocks or bombs upon state change (e.g. ghost rematerialization, boss leap landing).
   - Ally behaviors: friendly fire avoidance, item vacuum logic, threat detection.
3. **Memory Leaks, Object Pooling & Performance**:
   - `ObjectPool<T>` (bombs, blasts, particles, items, floating text): recycle completeness, reset states, leak tests.
   - `AudioVoicePool` and Web Audio API: node disconnects, audio context suspension on tab switch, pool exhaustion.
   - Phaser texture cache, graphics instances, timer events, tweens cleanup upon scene restarts / unmounts.
   - DOM event listeners in React components (`BombermanGame.tsx`, inventory drawer, mobile controls).
4. **UI, Controls & Real-Time Sync**:
   - React <-> Phaser event bridge: payload consistency, unmounted component updates, memory leaks in event listeners.
   - HUD gauges: bomb count, speed level, fire level, ultimate gauge, active skill timers.
   - Mobile touch controls: multi-touch spam, drag-off-screen, touch cancellation, dash/ult button responsiveness.
   - Inventory modal / drawer: responsive sizing, keyboard focus traps, tooltip alignment.
5. **Security, State Persistence & Integrity**:
   - Save state checksum validation (FNV-1a / DJB2): tampering resilience, corrupted JSON handling, schema evolution.
   - Storage limits: sessionStorage / localStorage quota handling, fallback gracefully.
   - Prototype pollution, unsafe eval, arbitrary property injection.
   - API 429 recovery & CircuitBreaker queue integrity.
6. **Architecture, Bosses, Crises & Infinite Modes**:
   - Boss fight transitions: phase change invulnerability, simultaneous multi-bomb death races, minion cleanup.
   - Crisis lifecycle: whisper -> outbreak -> climax -> resolution, multiple simultaneous crisis handling.
   - Endless Gauntlet / Boss Rush / Crisis Survival mode transitions, state reset between runs.
   - Infinite scaling parameter caps (speed, spawn rate, HP) preventing division-by-zero or infinite loops.

## Execution Stages
- **Stage 1: Multi-Agent Parallel Inspection**
  - Dispatch 6 specialized Explorers to deep-dive into each domain.
  - Collect detailed inspection reports with file paths and line numbers.
- **Stage 2: Synthesis & Issue Inventory**
  - Consolidate all discovered issues into `PROJECT.md` / `INSPECTION_REPORT.md`.
  - Categorize by severity (Critical, High, Medium, Low).
- **Stage 3: Remediation & Defensive Testing**
  - Dispatch Workers to apply fixes and implement permanent unit/integration defensive tests.
  - Require workers to verify fixes via `npm run test`, `npm run lint`, `npm run build`.
- **Stage 4: Adversarial Review & Forensic Audit**
  - Dispatch Reviewers and Challengers to stress-test the fixes.
  - Dispatch Forensic Auditor for integrity check.
- **Stage 5: Verification & Delivery**
  - Full test suite run, lint check, build check.
  - Git commit and push to main.
  - Completion report to Sentinel.
