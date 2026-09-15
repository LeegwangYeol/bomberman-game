# Dispatch: Worker Hardening Fix — Dash & Shield Invulnerability Race Condition

## 2026-09-15T04:46:00Z
You are worker_fix_dash_shield, a Worker subagent in the Bomberman project.
Your working directory is: /Users/user/src/bomberman/.agents/worker_fix_dash_shield

Implement the hardening fix:
1. In `src/game/GameScene.ts`, track `shieldInvulnerableUntil` when shield absorbs a hit (setting `shieldInvulnerableUntil = this.time.now + 1500`).
2. In `performDash()` delayedCall, only set `this.isInvulnerable = false` if `this.time.now >= this.shieldInvulnerableUntil`.
3. In sliding bomb collision check, use adaptive lookahead: `Math.max(16, BOMB_KICK_SPEED * (delta / 1000) + 4)`.
4. Update `tests/skills_gimmicks_hud_stress.test.mjs` line 348 to verify that dashing during shield recovery preserves invulnerability after dash ends!
5. Run `npm test`, `npm run lint`, and `npm run build` to verify that all tests pass with 0 errors.
6. Write handoff report to `/Users/user/src/bomberman/.agents/worker_fix_dash_shield/handoff.md`.
When complete, send a message to parent notifying completion.
