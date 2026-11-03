# Chaos QA & Resilience Division: Attack Vectors & Verification Matrix
**Daily Evolution Cycle**: 2026-11-04
**Division**: Chaos QA & Resilience Division (10 Subagents: Chaos QA 1 to Chaos QA 10)

## 1. Attack Vectors Tested

1. **Boundary Coordinate Fuzzing (`spawnSubterraneanRoot`)**:
   - Attack: Injected negative coordinates (-999999, -Infinity), extreme high bounds (999999, +Infinity), and NaN coordinates.
   - Guard & Invariant: Target coordinates clamped to valid arena range [60..540, 60..460] with row clamped to [1..11] and col clamped to [1..13].
2. **Subnormal & Float-Epsilon Blast Cleansing (`cleanseRootsAt`)**:
   - Attack: Subnormal float coordinates (1e-320), negative radius (-5), zero radius (0), and extreme blast radius (1000).
   - Invariant: Guard against negative/zero distance calculations, safely release affected root hazards from `rootPool`, and clamp `activeRoots = Math.max(0, activeRoots - cleansed)`.
3. **Zero-Distance Vector Singularities (`emitPollenCloud`)**:
   - Attack: Target coordinates exactly coincident with boss coordinates ($dx = 0, dy = 0, dist = 0$) and NaN target coordinates.
   - Invariant: Prevent division by zero; default projectile velocity to $pVx = 0, pVy = speed$.
4. **State Machine Rapid Toggling (`burrowUnderground` & `emergeFromUnderground`)**:
   - Attack: Rapid alternation between underground and surface states within the same frame.
   - Attack: Applying stun (`applyStun()`) while underground -> forces immediate emergence (`emergeFromUnderground()`), cleanses invulnerability, and applies stun duration cleanly.
   - Attack: Boss defeat (`onDefeated()`) while underground -> forces immediate emergence, purges roots, resets velocity, and prevents post-mortem burrow loops.
5. **ObjectPool Capacity & Allocation Denial (`rootPool`)**:
   - Attack: 100+ rapid sprout calls when `activeRoots >= maxRoots` (6).
   - Invariant: `acquire()` gracefully returns null without heap allocation or uncaught exceptions, and `rootPool.reset()` frees all 16 slots without double-free errors.
6. **WebAudio High-Concurrency & Stress Fuzzing**:
   - Attack: 1,000 rapid calls to `playRootEruption()`, `playSporePodLaunch()`, `playVineWhip()`, and `playPeaceBloom()`.
   - Invariant: Rate-limiting debounce prevents audio context starvation; dual-watchdog guarantees zero orphaned nodes.
7. **AudioVoicePool Voice Stealing Under Load**:
   - Attack: 16-voice pool concurrent exhaustion across boss audio and multi-hazard sounds.
   - Invariant: Micro-fade preemption prevents audio click pops; voice count never diverges.
8. **10,000-Frame Zero-GC Soak Test**:
   - Verification: Continuous 10,000-frame simulation through Wave 10 and Wave 20 CRISIS_BOSS stages.
   - Invariants: 0 heap leaks (< 0.20 MB drift), 0 active timer leaks, < 1.0 µs/frame processing time.
9. **Regression Invariant Guard**:
   - Verified that UI Text Occlusion, AI pathfinding corner sliding, and bomb blast collision systems remain 100% green.
