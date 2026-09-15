# Empirical Challenge Report: Skills, Map Gimmicks & React HUD Synchronization

**Subagent**: `challenger_mech_2`  
**Role**: Critic, Specialist (Empirical Challenger)  
**Date**: 2026-09-15T04:45:00Z  
**Verdict**: **CHALLENGE_DETECTED**

---

## 1. Observation

### Observation 1.1: Dash Overwrite of Shield Recovery Invulnerability (Race Condition)
In `src/game/GameScene.ts`, lines 1866–1904:
```typescript
    if (this.hasShield) {
      this.hasShield = false;
      this.isInvulnerable = true;
      this.cameras.main.shake(120, 0.01);

      // Spawn shield shatter burst
      ...

      // 1.5s i-frame blink
      this.tweens.add({
        targets: this.player,
        alpha: 0.3,
        duration: 100,
        yoyo: true,
        repeat: 7,
        onComplete: () => {
          if (this.player && this.player.active) {
            this.player.alpha = 1;
            this.isInvulnerable = false;
          }
        },
      });

      this.emitStatsUpdate();
      return;
    }
```
In `src/game/GameScene.ts`, lines 1942–1983:
```typescript
  private performDash() {
    this.isDashing = true;
    this.isInvulnerable = true;
    this.dashCooldownRemaining = DASH_COOLDOWN_MS;
    ...
    this.time.delayedCall(DASH_DURATION_MS, () => {
      this.isDashing = false;
      this.isInvulnerable = false;
      if (this.player && this.player.active) {
        this.player.setVelocity(0, 0);
      }
    });

    this.emitStatsUpdate();
  }
```
In `src/game/GameScene.ts`, lines 1233–1235:
```typescript
    if (dashPressed && !this.isDashing && this.dashCooldownRemaining <= 0 && !this.isGameOver) {
      this.performDash();
    }
```
When a player's shield is broken, `this.isInvulnerable` is set to `true`, accompanied by a 1.5-second blink tween (100ms yoyo repeated 7 times ≈ 1500ms).
However, `performDash()` does NOT check `!this.isInvulnerable`. A player escaping damage can trigger Dash. Dash lasts `DASH_DURATION_MS = 140ms`. When the dash timer concludes at t=140ms, `this.isInvulnerable` is unconditionally set to `false`.
Consequently, the remaining ~1360ms of shield invulnerability is prematurely revoked while the player character is still visibly flashing. A subsequent collision at t=200ms instantly eliminates the player.

This behavior was empirically isolated and verified in `tests/skills_gimmicks_hud_stress.test.mjs`:
```javascript
✔ EMPIRICAL CHALLENGE: Dash cancellation of Shield Recovery i-frame (0.142875ms)
```

### Observation 1.2: Portal Debounce Anti-Oscillation Robustness
In `src/game/GameScene.ts`, lines 1224–1226, 1262–1269, and 1988–1991:
```typescript
    if (this.portalCooldown > 0) {
      this.portalCooldown = Math.max(0, this.portalCooldown - delta);
    }
    ...
    if (this.portalCooldown <= 0) {
      if (pRow === DEFAULT_PORTALS.portalA.row && pCol === DEFAULT_PORTALS.portalA.col) {
        this.warpPlayer(DEFAULT_PORTALS.portalB.row, DEFAULT_PORTALS.portalB.col);
      } else if (pRow === DEFAULT_PORTALS.portalB.row && pCol === DEFAULT_PORTALS.portalB.col) {
        this.warpPlayer(DEFAULT_PORTALS.portalA.row, DEFAULT_PORTALS.portalA.col);
      }
    }
```
Under an empirical 10,000-frame simulation (166 seconds at 60fps), an AFK entity standing on `portalA` triggered exactly 138 warps (bounded by `PORTAL_COOLDOWN_MS = 1200ms`), completely preventing single-frame ping-pong loops (0 immediate reverse warps). Kicked bombs traverse portal tiles without triggering player warp logic.

### Observation 1.3: Conveyor Drift Collisions & Entity Stacking
In `src/game/GameScene.ts`, lines 1246–1260 and 1311–1324:
Conveyor belts apply 60 px/s drift.
When pushed into terminal obstacles (walls/blocks), `Math.floor(nextX / TILE_SIZE) === TILE_EMPTY` prevents the player's center from entering the wall tile.
Dashing overrides conveyor drift (`if (belt && !this.isDashing)`), allowing instant escape. Multiple bombs drifting along the conveyor queue up and cascade detonate safely without infinite loops.

### Observation 1.4: Shield Absorption Under Simultaneous Damage
In `src/game/GameScene.ts`, line 1864:
```typescript
    if (this.isInvulnerable) return;
```
When tested with 8 simultaneous damage hits occurring in the exact same physics frame (Frame 0):
- Hit 1 consumes the shield and synchronously flags `this.isInvulnerable = true`.
- Hits 2–8 are safely deflected by `if (this.isInvulnerable) return;`.
- Exactly 1 shield is consumed; game over is not triggered.

### Observation 1.5: React HUD Event Bridge Synchronization
In `src/game/GameScene.ts`, lines 1920–1940:
```typescript
  public getStats(): PlayerStats {
    return {
      speed: this.playerSpeed,
      speedLevel: this.speedLevel,
      maxBombs: this.maxBombs,
      activeBombs: this.activeBombs,
      bombPower: this.bombPower,
      hasKick: this.hasKick,
      hasShield: this.hasShield,
      dashCooldownRemaining: Math.max(0, Math.ceil(this.dashCooldownRemaining)),
      itemsCollected: { ...this.itemsCollected },
      score: this.score,
      isGameOver: this.isGameOver,
    };
  }
```
500 rapid event emissions across bombs, powerups, and skills maintained deep immutable snapshot isolation. Clamping bounds remained strictly intact (speed in [150, 250], bombs in [1, 8], power in [2, 8]).
Event throttling was observed: walking without state changes emits 0 updates to prevent 60fps React render flooding. Dash cooldown is event-driven (emitted at 3.5s and at 0.0s).

### Observation 1.6: Build and Test Command Telemetry
1. `npm test`:
   - Executed: `node --experimental-strip-types --test tests/*.test.mjs`
   - Output: 153 tests passed across 10 test suites, 0 failed, 0 skipped. Duration: 502ms.
2. `npm run build`:
   - Executed: `next build` (Turbopack)
   - Output: Static export compiled successfully in 325ms, TypeScript checked in 706ms, 0 errors (Exit code 0).

---

## 2. Logic Chain

1. **Premise 1 (Shield Contract)**: When a player with an active shield takes fatal damage, `playerDie()` is designed to consume the shield and grant a 1.5-second (`SHIELD_INVULN_MS = 1500`) invulnerability grace window to allow the player to escape the hazard zone.
2. **Premise 2 (Dash Contract)**: When `performDash()` is invoked, it grants invulnerability for the duration of the dash (`DASH_DURATION_MS = 140ms`), then schedules `delayedCall(140ms, () => { this.isInvulnerable = false; })`.
3. **Premise 3 (State Overwrite)**: Because `performDash()` has no awareness of active shield recovery tweens or timers, the 140ms delayed call executes and unconditionally overwrites `this.isInvulnerable = false`.
4. **Deduction (Vulnerability)**: Any player who gets their shield broken and instinctively uses Dash to escape will lose their remaining ~1.36 seconds of shield invulnerability immediately when the 140ms dash concludes. Even though their sprite continues to blink as if protected, they are instantly vulnerable to any secondary explosion ray or trailing enemy, resulting in false-protection deaths.
5. **Conclusion**: While all map gimmicks (portals, conveyors) and simultaneous multi-hit shield absorption perform as designed, the interaction between Dash completion and Shield recovery represents an empirical race condition bug. Hence, the appropriate empirical verdict is `CHALLENGE_DETECTED`.

---

## 3. Caveats

1. **Hardware Multi-Touch**: Tests verified discrete and rapid input state transitions; physical multi-touch device screen latency was not tested on real hardware.
2. **Visual Blink Desync**: In the Dash-Shield collision, the player sprite continues to blink via Phaser tween even after `isInvulnerable` has been set to false. This creates a visual desync where the UI implies safety while physics registers vulnerability.
3. **No Code Fix Applied**: In accordance with the Challenger role constraints (`Review-only — do NOT modify implementation code`), `src/game/GameScene.ts` was not altered.

---

## 4. Conclusion

**Verdict**: **CHALLENGE_DETECTED**

The core systems under test demonstrate high empirical resilience:
- **Portals**: Completely immune to infinite rapid-oscillation loops via 1200ms debounce.
- **Conveyors**: Drift cleanly at 60 px/s with solid obstacle boundary clamping and safe bomb cascade stacking.
- **Simultaneous Damage**: 8 concurrent hits are cleanly absorbed by a single shield with synchronous i-frame engagement.
- **HUD Event Bridge**: Throttled and memory-safe under 500 rapid event bursts.

**Actionable Finding to Address**:
In `src/game/GameScene.ts`, `performDash()` should track whether a shield recovery i-frame is currently active (e.g. using a timestamp `invulnerableUntilMs` or checking if shield recovery tween is running) before resetting `this.isInvulnerable = false` at the end of a dash:
```typescript
// Proposed fix pattern for worker:
this.time.delayedCall(DASH_DURATION_MS, () => {
  this.isDashing = false;
  // Only revoke invulnerability if no shield recovery timer is active
  if (this.time.now >= this.shieldInvulnerableUntil) {
    this.isInvulnerable = false;
  }
  if (this.player && this.player.active) {
    this.player.setVelocity(0, 0);
  }
});
```

---

## 5. Verification Method

1. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   Inspect results for `tests/skills_gimmicks_hud_stress.test.mjs` verifying that all 18 stress tests run and pass.
2. **Observe Specific Challenge Reproduction**:
   Inspect `tests/skills_gimmicks_hud_stress.test.mjs` line 348 (`EMPIRICAL CHALLENGE: Dash cancellation of Shield Recovery i-frame`).
3. **Run Production Build**:
   ```bash
   npm run build
   ```
   Verify 0 TypeScript/Turbopack errors and clean static page generation.
