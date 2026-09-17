# M1 Worker 1: Zero-GC Object Pooling & 10k Soak Test Implementation

## Mission
You are M1 Worker 1 working in `/Users/user/src/bomberman/.agents/m1_worker_1/`.
You MUST read:
- `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/TEST_INFRA.md`
- Explorer findings:
  - `/Users/user/src/bomberman/.agents/m1_explorer_1/handoff.md` and `/Users/user/src/bomberman/.agents/m1_explorer_1/proposed_pathfinding.ts`
  - `/Users/user/src/bomberman/.agents/m1_explorer_2/handoff.md` and `/Users/user/src/bomberman/.agents/m1_explorer_2/report.md`
  - `/Users/user/src/bomberman/.agents/m1_explorer_3/handoff.md` and `/Users/user/src/bomberman/.agents/m1_explorer_3/proposed_soak_10k_frames.test.mjs`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Tasks & File Ownership
You exclusively own and must implement:
1. `src/game/pathfinding.ts`: Deploy the 1D typed-array `ZeroGCPathfinder` and `FlatHazardMask` based on `proposed_pathfinding.ts`. Maintain 100% backward compatibility with all legacy functions (`findPathBFS`, `findEscapePathBFS`, `getBlastTiles`, `isTileInBlastRange`).
2. `src/game/pooling/ObjectPool.ts`: Implement generic, contiguous typed-array `ObjectPool<T>` with `acquire()`, `release()`, `forEachActive()`, `reset()`, double-release protection, and capacity presets (Bombs 32, Explosions 128, Particles 256, Item Drops 48, Floating Text 32).
3. `src/game/pooling/AudioVoicePool.ts`: Implement native Web Audio voice recycling pool with dynamic waveforms, gain ADSR envelopes, voice stealing, and headless safe fallback.
4. `src/game/ultimate_skills.ts`: Refactor `CameraTraumaSimulator` to use pre-allocated mutable scratch vectors for `getOffsets()` and `getShakeMagnitude()` to eliminate 20,000 per-run allocations.
5. `src/game/GameScene.ts`: Replace `const bombTiles = new Set<string>();` on line 1745 with the reusable `FlatHazardMask` instance, avoiding per-frame Set creation.
6. `tests/unit/object_pool.test.mjs`: Create thorough unit tests for `ObjectPool<T>`.
7. `tests/unit/audio_voice_pool.test.mjs`: Create thorough unit tests for `AudioVoicePool`.
8. `tests/soak_10k_frames.test.mjs`: Deploy the 10,000-frame soak test from `m1_explorer_3/proposed_soak_10k_frames.test.mjs`.

## Verification Commands
Run and confirm:
1. `npm test` (all tests pass, 0 failures)
2. `node --expose-gc --experimental-strip-types --test tests/soak_10k_frames.test.mjs` (heap drift <= 0.25 MB)
3. `npm run lint` (0 errors)
4. `npm run build` (Next.js build succeeds with exit code 0)

Document all commands and verification results in `handoff.md`.
