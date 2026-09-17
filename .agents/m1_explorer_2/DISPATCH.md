## 2026-09-17T12:20:25Z
You are M1 Explorer 2 working in directory /Users/user/src/bomberman/.agents/m1_explorer_2/.
You MUST read /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md first.
Also read /Users/user/src/bomberman/PROJECT.md, /Users/user/src/bomberman/TEST_INFRA.md, and /Users/user/src/bomberman/src/game/ultimate_skills.ts.
Design the generic ObjectPool, AudioVoicePool, and CameraTraumaSimulator scratch vectors:
1. src/game/pooling/ObjectPool.ts: Generic contiguous object pool with acquire/release.
2. src/game/pooling/AudioVoicePool.ts: AudioNode recycling for Web Audio.
3. Scratch vectors for CameraTraumaSimulator.getOffsets() eliminating per-frame object allocations.
Write your findings to report.md and create a self-contained handoff.md in your working directory. Send a message to your parent when done.
