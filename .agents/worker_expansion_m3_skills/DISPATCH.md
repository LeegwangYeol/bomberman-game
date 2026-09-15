## 2026-09-15T10:31:27Z

You are Worker M3 (Ultimate Skills & High-Impact VFX) on the Bomberman project in /Users/user/src/bomberman.
Your working directory is: /Users/user/src/bomberman/.agents/worker_expansion_m3_skills

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY READING:
You MUST read:
1. /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
2. /Users/user/src/bomberman/PROJECT.md
3. /Users/user/src/bomberman/tests/ultimate_skills.test.mjs
4. /Users/user/src/bomberman/tests/hud_inventory_expansion.test.mjs
5. /Users/user/src/bomberman/.agents/explorer_expansion_skills/handoff.md

OBJECTIVES & REQUIREMENTS:
1. Implement `src/game/ultimate_skills.ts`:
   - `ULTIMATE_SKILLS` registry strictly matching `tests/ultimate_skills.test.mjs`:
     - `METEOR_STRIKE`: cost 100, lockoutMs 6000, warningMs 600, impactRadius 1 (3x3 footprint), meteorCount 8-10, trauma 0.35, scorchDecalMs 2000.
     - `SUPER_NOVA`: cost 100, lockoutMs 6000, implosionMs 300, hitStopMs 60, maxRadiusTiles 5, tileWaveDelayMs 40, trauma 1.0.
     - `CHRONO_FREEZE`: cost 100, lockoutMs 6000, durationMs 5000, playerSpeedMultiplier 1.20, traumaOnResume 0.60 (freezes external entities and bombs).
     - `NUCLEAR_BARRAGE`: cost 100, lockoutMs 6000, maxWarheads 16, maxDepthPerArm 4, fuseMs 1200, cascadeStepDelayMs 70, traumaPerStep 0.15.
     - `AEGIS_OVERDRIVE`: cost 100, lockoutMs 6000, durationMs 6000, maxDurationMs 8000, absorbBonusMs 300, speedBonus 40, reflectKnockbackTiles 2, reflectDamage 100.
   - `CHARGE_VALUES`: Block +2, Enemy +15, Tracker/Elite +25, Energy Spark +10, Close Call +5, Survival Tick +1 every 3000ms.
   - `CameraTrauma` / camera shake system: Square-law decay model (trauma in [0.0, 1.0], decay rate 1.4 s^-1, maxOffset 18px, maxAngle 3.5 deg).
   - Zero-dependency procedural Web Audio synthesis engine (`WebAudioSynth`) for audio feedback (meteors, shockwaves, time stasis ticks, carpet detonations, crystal shield hum).
   - VFX generation helpers (targeting reticles, meteor streaks, shockwave rings, stasis stipple/tint, carpet bomb markers, aegis radiant dome).

2. Integration into `src/game/GameScene.ts`:
   - Wire player ultimate gauge state (`ultimateGauge`, `ultimateMax`, `isUltimateReady`, `activeUltimate`, `ultimateLockoutRemaining`).
   - Earn gauge on block destruction (+2), enemy kill (+15/+25), and periodic survival drip (+1/3s).
   - Respect 6,000ms lockout timer (0% generation during lockout).
   - Desktop hotkeys: 'R' and 'Q' triggers active/selected ultimate skill.
   - Mobile touch trigger: reads `window.mobileInput.ultimate`.
   - Implement the visual and tactical gameplay effects for all 5 skills.
   - Update camera trauma shake each frame in `GameScene.update()`.

3. Integration into `src/components/BombermanGame.tsx`:
   - Arcade HUD: Display ultimate energy gauge (0-100%) with golden progress bar, ready indicator, and pulsing glow when 100%.
   - Mobile Controls: Add 64px golden crown `[ULT]` button to virtual controls arc in bottom right, binding to `window.mobileInput.ultimate`.
   - Update `window.mobileInput` type definition if needed to include `ultimate: boolean`.
   - Ensure mobile touch targets >= 48px.

VERIFICATION:
Run and verify passing:
- `node --test tests/ultimate_skills.test.mjs` (16/16 pass)
- `node --test tests/hud_inventory_expansion.test.mjs` (11/11 pass)
- `npm test` (all 241+ tests pass with 0 regressions)
- `npm run lint` (0 errors)
- `npm run build` (Next.js Turbopack build exit code 0)

DELIVERABLE:
Write detailed `handoff.md` in `/Users/user/src/bomberman/.agents/worker_expansion_m3_skills/handoff.md` with:
- Files modified/created
- Test execution outputs
- Architecture summary
Then send a completion message back to orchestrator.

## 2026-09-15T11:30:57Z
**Context**: Milestone M3 (Ultimate Skills & High-Impact VFX)
**Content**: Heartbeat check. `GameScene.ts` and `ultimate_skills.ts` appear updated.
**Action**: Please report your current step, test verification status (e.g. `tests/ultimate_skills.test.mjs`, `npm test`), and remaining work.

