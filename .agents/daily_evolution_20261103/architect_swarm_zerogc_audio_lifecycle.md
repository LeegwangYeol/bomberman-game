# Architect & Zero-GC Division: Technical Hardening & Lifecycle Specifications
**Daily Evolution Cycle**: 2026-11-03
**Division**: Architect & Zero-GC Division (5 Subagents: Architect 1 to Architect 5)

## 1. Zero-GC Object Allocation Invariant
- Pre-allocate all tone parameters inside `RIFT_AUDIO_PRESETS` with `deepFreezePresets()` and `freezeTonePreset()`.
- No dynamic allocations or closure recreation inside hot-path audio dispatchers (`playTeleport`, `playSpireSync`, `playSyncLost`, `playRealityStabilized`).
- Reuse a static 500ms white noise buffer (`cachedNoiseBuffer`) per sample rate.

## 2. Double-Watchdog Teardown & Lifecycle Sanitation
- **Transient Node Tracking**: Maintain `Set<AudioNode>` for all active buffer sources, filters, and gains.
- **Dual Cleanup**: Attach `sourceNode.onended` AND register a fallback `setTimeout` timer tracked in `activeTimeouts`.
- **Teardown Cleansing**: Implement `stop()`, `reset()`, `destroy()`, and `resetInstance()`. Teardown must clear all active timers and disconnect all transient audio nodes.

## 3. Serialization Contract Enforcement
- Implement `getExtraSerializedState()` in `RiftCrisis.ts`:
  - `isQuantumSyncActive`: boolean
  - `quantumSyncTimerMs`: number
  - `warpsPerformedCount`: number
  - `phantomsActive`: boolean
  - `spires`: Array of `{ r: number, c: number, isPolarized: boolean, hitTimestampMs: number }`
- Implement `applyExtraSerializedState()` with strict NaN and bounds guards:
  - Validate numeric timers, array structures, and boolean flags against corrupted save states.

## 4. Single-Point Clean Teardown
- Register `RiftCrisisAudio.resetInstance()` into `GameScene.shutdown()`.
- Export `RiftCrisisAudio` and all presets via `src/game/crises/index.ts`.
