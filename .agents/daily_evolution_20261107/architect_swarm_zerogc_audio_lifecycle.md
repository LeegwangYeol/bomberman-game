# Architect & Zero-GC Division: Audio Lifecycle & Codebase Harmonization Report
**Daily Evolution Cycle**: 2026-11-07
**Division**: Architect & Zero-GC Division (5 Subagents: Architect 1 to Architect 5)

## 1. Zero-GC & Memory Architecture Directives
- **Zero-GC Voice Allocation**: All synthesized musical tones are channeled through the pre-allocated 16-voice pool (`AudioVoicePool.ts`). Tone parameter definitions are frozen at module evaluation time with `deepFreezePresets` to guarantee zero runtime object allocations.
- **Permanent Static Noise Buffer**: White noise sound effects reuse a single static 500ms `AudioBuffer` (`cachedNoiseBuffer`) per sample rate. The allocation occurs strictly once during first invocation and never produces heap thrashing during continuous frame execution.
- **Dual-Watchdog Leak Prevention**: Every transient Web Audio node (`BufferSourceNode`, `BiquadFilterNode`, `GainNode`) is registered with an active node set. Primary cleanup executes via `source.onended`, with an emergency fallback watchdog timer registered via `setTimeout` (+50ms margin).
- **Forced State Pruning**: Complete reset and teardown methods (`clearPendingNodes()`, `reset()`, `destroy()`) disconnect dangling audio nodes, unregister `setTimeout` IDs, and release all reference closures.

## 2. Harmonization Targets
1. **`HamsterAudio.ts`**:
   - Deliver 100% compliant procedural audio engine implementing `getInstance()`, `resetInstance()`, `clearPendingNodes()`, `destroy()`, `reset()`, and `deepFreezePresets`.
   - Provide fallback SSR protection returning safe defaults when `window` or `AudioContext` is undefined.
2. **`HamsterBoss.ts`**:
   - Harden physics simulation loop (`updateDashCombat`):
     - Finite float guards: `if (!Number.isFinite(dt) || dt <= 0) return;`
     - Clamping invariants: `this.clampPosition()` across all dash updates, 90° wall bank shots, and head-on bomb collision recoils.
     - State guard: `canTakeDamage()` returns `false` during `INTRO`, `INTERMISSION`, or `DEFEATED`.
     - Head-on bomb check: bind `headOnBombCheck` hook and dispatch `onHeadOnBombCollision()`.
     - Complete lifecycle disposal: override `destroy()` to call `this.audio.destroy()` and `super.destroy()`.
3. **`GameScene.ts`**:
   - Register `HamsterAudio.resetInstance()` into `shutdown()` method to guarantee symmetrical resource deallocation.
