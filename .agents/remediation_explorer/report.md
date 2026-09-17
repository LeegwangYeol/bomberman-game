# Comprehensive Remediation Plan: Boss Subsystem Integrity Fix & Application Integration

**Explorer**: Remediation Explorer  
**Working Directory**: `/Users/user/src/bomberman/.agents/remediation_explorer/`  
**Target Codebase**: `/Users/user/src/bomberman/`  
**Date**: 2026-09-17  

---

## Executive Summary

The Milestone 6 Forensic Audit identified a critical **INTEGRITY VIOLATION**:
1. **Module Import Failures**: Every file in `src/game/bosses/` contained extensionless relative imports (`from './BossTypes'`, `from '../pathfinding'`), which cause `ERR_MODULE_NOT_FOUND` under Node.js native ESM (`node --experimental-strip-types`).
2. **Test Bypass**: Rather than resolving the module resolution failure, `tests/bosses.test.mjs` declared parallel in-file mock replicas (`SimBaseBoss`, `TelegraphSimulator`, `GummyBearSim`, `HamsterSim`, `QueenBeeSim`) spanning lines 35–460 and tested those mocks, leaving deliverable code in `src/game/bosses/` completely unexecuted and untested.
3. **Application Unlinking**: Neither `GameScene.ts` nor `BombermanGame.tsx` imported or linked `src/game/bosses/`.

This document provides a concrete, step-by-step remediation plan with **exact, verified diffs and drop-in code** to resolve all three issues cleanly without regressions.

---

## Section 1: Exact Diffs for `src/game/bosses/*.ts`

All relative imports in `src/game/bosses/*.ts` must include explicit `.ts` extensions, matching the convention established in `src/game/crises/` and `src/game/progression/`.

### 1.1 `src/game/bosses/types.ts`
```diff
--- a/src/game/bosses/types.ts
+++ b/src/game/bosses/types.ts
@@ -2,5 +2,5 @@
  * types.ts — Re-exports for Boss subsystem
  */
 
-export * from './BossTypes';
+export * from './BossTypes.ts';
```

### 1.2 `src/game/bosses/BaseBoss.ts`
```diff
--- a/src/game/bosses/BaseBoss.ts
+++ b/src/game/bosses/BaseBoss.ts
@@ -6,7 +6,7 @@
  * Pure simulation logic decoupled from Phaser visuals for 100% headless testability.
  */
 
-import { BossState, BossId } from './BossTypes';
+import { BossState, BossId } from './BossTypes.ts';
 
 export { BossState };
 
@@ -70,6 +70,7 @@ export abstract class BaseBoss {
   public readonly defaultIFrameMs: number = 1500;
 
   // Stun & Recovery
+  public stunDurationMs: number = 0;
   public stunTimerMs: number = 0;
   public previousStateBeforeStun: BossState = BossState.PHASE_1;
 
@@ -256,6 +257,7 @@ export abstract class BaseBoss {
       this.previousStateBeforeStun = this.bossState;
     }
     this.bossState = BossState.STUNNED;
+    this.stunDurationMs = durationSec * 1000;
     this.stunTimerMs = Math.max(this.stunTimerMs, durationSec * 1000);
     this.vx = 0;
     this.vy = 0;
@@ -350,6 +352,26 @@ export abstract class BaseBoss {
     }
   }
 
+  public getState(): BossState {
+    return this.bossState;
+  }
+
+  public get state(): BossState {
+    return this.bossState;
+  }
+
+  public get isComboActive(): boolean {
+    return this.comboBufferTimerMs > 0;
+  }
+
+  public get isStunned(): boolean {
+    return this.bossState === BossState.STUNNED;
+  }
+
+  public get stunRemainingMs(): number {
+    return this.stunTimerMs;
+  }
+
   public getHUDData(): BossHUDData {
     return {
       bossId: this.config.id,
```

### 1.3 `src/game/bosses/TelegraphEngine.ts`
```diff
--- a/src/game/bosses/TelegraphEngine.ts
+++ b/src/game/bosses/TelegraphEngine.ts
@@ -14,7 +14,7 @@ import {
   TOTAL_TILES,
   TILE_SIZE,
   TILE_WALL,
-} from '../pathfinding';
+} from '../pathfinding.ts';
 
 /**
  * Universal Telegraph Warning Tiers
```

### 1.4 `src/game/bosses/GummyBearBoss.ts`
```diff
--- a/src/game/bosses/GummyBearBoss.ts
+++ b/src/game/bosses/GummyBearBoss.ts
@@ -5,7 +5,7 @@
  * Gummy Minion Spawns, and Masterplay Lure Landing Stun (2.2s -> 4.0s).
  */
 
-import { BaseBoss, BossConfig, BossState } from './BaseBoss';
+import { BaseBoss, BossConfig, BossState } from './BaseBoss.ts';
 
 export class GummyBearBoss extends BaseBoss {
   public isAirborne: boolean = false;
```

### 1.5 `src/game/bosses/HamsterBoss.ts`
```diff
--- a/src/game/bosses/HamsterBoss.ts
+++ b/src/game/bosses/HamsterBoss.ts
@@ -5,7 +5,7 @@
  * Sunflower Gatling seed spray, 360° Gyro-Laser Sweep, and EMP Minefield.
  */
 
-import { BaseBoss, BossConfig, BossState } from './BaseBoss';
+import { BaseBoss, BossConfig, BossState } from './BaseBoss.ts';
 
 export class HamsterBoss extends BaseBoss {
   public isDashing: boolean = false;
```

### 1.6 `src/game/bosses/QueenBeeBoss.ts`
```diff
--- a/src/game/bosses/QueenBeeBoss.ts
+++ b/src/game/bosses/QueenBeeBoss.ts
@@ -5,7 +5,7 @@
  * Honey Carpet caramelization, Stinger Salvo, Anti-Air Pollen Sniping, and Supersonic Dive Coma.
  */
 
-import { BaseBoss, BossConfig, BossState } from './BaseBoss';
+import { BaseBoss, BossConfig, BossState } from './BaseBoss.ts';
 
 export class QueenBeeBoss extends BaseBoss {
   public isGrounded: boolean = false;
```

### 1.7 `src/game/bosses/BossAttackManager.ts`
```diff
--- a/src/game/bosses/BossAttackManager.ts
+++ b/src/game/bosses/BossAttackManager.ts
@@ -6,14 +6,14 @@
  * Guarantees zero heap allocations during the 60 FPS update loop.
  */
 
-import { ObjectPool } from '../pooling/ObjectPool';
+import { ObjectPool } from '../pooling/ObjectPool.ts';
 import {
   BossProjectile,
   BossProjectileType,
   BossShockwave,
   BossMinion,
   TelegraphTile,
-} from './BossTypes';
+} from './BossTypes.ts';
 
 export class BossAttackManager {
   public readonly projectilePool: ObjectPool<BossProjectile>;
```

### 1.8 `src/game/bosses/BossHUD.ts`
```diff
--- a/src/game/bosses/BossHUD.ts
+++ b/src/game/bosses/BossHUD.ts
@@ -10,7 +10,7 @@ import {
   BossState,
   BossId,
   BossThreatAlert,
-} from './BossTypes';
+} from './BossTypes.ts';
 
 export interface IGameEventEmitter {
   events?: {
```

### 1.9 `src/game/bosses/index.ts` (NEW FILE)
Create `src/game/bosses/index.ts` mirroring `src/game/crises/index.ts`:
```typescript
/**
 * index.ts — Universal Boss Subsystem Exports
 */

export * from './BossTypes.ts';
export * from './BaseBoss.ts';
export * from './GummyBearBoss.ts';
export * from './HamsterBoss.ts';
export * from './QueenBeeBoss.ts';
export * from './TelegraphEngine.ts';
export * from './BossAttackManager.ts';
export * from './BossHUD.ts';
```

---

## Section 2: Complete Refactoring of `tests/bosses.test.mjs`

### 2.1 Problem Analysis of Current Test File
- Current `tests/bosses.test.mjs` does **not import a single file** from `src/game/bosses/`.
- Lines 22–30 declare duplicate `BossState`.
- Lines 35–181 declare `SimBaseBoss` (a full mock replica of `BaseBoss`).
- Lines 276–304 declare `TelegraphSimulator` (a mock replica of `TelegraphEngine`).
- Lines 344–368 declare `GummyBearSim` (a mock replica of `GummyBearBoss`).
- Lines 395–415 declare `HamsterSim` (a mock replica of `HamsterBoss`).
- Lines 441–475 declare `QueenBeeSim` (a mock replica of `QueenBeeBoss`).
- Suite 7 lines 516–532 declare an inline `calculateActiveSegment` function instead of using `BossHUD`.

### 2.2 Refactored Drop-In Replacement for `tests/bosses.test.mjs`
All in-file mocks are eliminated. The test imports the deliverable classes directly.
Because `BaseBoss` is an abstract class, a minimal test subclass `TestFsmBoss extends BaseBoss` implements the abstract hooks without duplicating any FSM or combo buffer logic.

```javascript
/**
 * Milestone 2: Comprehensive Boss Subsystem Unit & Simulation Test Suite
 *
 * Directly exercises the deliverable implementation files from src/game/bosses/:
 * 1. BaseBoss 7-State FSM Transitions (INTRO, PHASE_1, INTERMISSION, PHASE_2, ENRAGED, STUNNED, DEFEATED)
 * 2. 150ms Multi-Bomb Combo Buffer Window & Stun Scaling (3.0s - 4.5s)
 * 3. 3-Tier Tile Telegraph Engine, Committed Trajectories & Fair Encounter Guarantee (>= 40% safe tiles)
 * 4. King Gummy Bear: Royal Leap, Sticky Pancake Stun (2.2s), Masterplay Lure (4.0s)
 * 5. Mecha Hamster Captain Nibbles: Kinetic Dash, Bank Shot, Head-On Collision Dizzy Stun (3.0s)
 * 6. Queen Bee Cupcake: Aerial Flight Immunity, Shield Popping, Dive-Bomb Crater Stun (2.5s)
 * 7. BossHUD State Synchronization & React Bridge Event Payloads
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  BossState,
  TelegraphTier,
  BaseBoss,
  GummyBearBoss,
  HamsterBoss,
  QueenBeeBoss,
  TelegraphEngine,
  BossHUD,
} from '../src/game/bosses/index.ts';

/* ==============================================================================
 * TEST HARNESS CONCRETE SUBCLASS FOR ABSTRACT BaseBoss
 * ============================================================================== */

class TestFsmBoss extends BaseBoss {
  constructor(maxHp = 10) {
    super(
      {
        id: 'test_boss',
        name: 'Test Boss',
        title: 'FSM Test Dummy',
        avatarEmoji: '🤖',
        maxHp,
        footprintWidth: 80,
        footprintHeight: 80,
        colliderRadius: 35,
        baseSpeed: 80,
        phase2HpThreshold: 0.7,
        phase3HpThreshold: 0.33,
      },
      300,
      260
    );
  }

  canTakeDamage() {
    return true;
  }

  updatePhase1() {}
  updatePhase2() {}
  updateEnraged() {}
  onHitReceived() {}
  onDamageBlocked() {}
  onStateChanged() {}
  onDefeated() {}
}

/* ==============================================================================
 * SUITE 1: 7-STATE FSM TRANSITIONS & COMBAT PROGRESSION
 * ============================================================================== */

test('Boss 1.1: BaseBoss — 7-state FSM transitions strictly respect lifecycle rules and HP thresholds', () => {
  const boss = new TestFsmBoss(10);

  // 1. Initial state is INTRO
  assert.strictEqual(boss.bossState, BossState.INTRO);
  assert.strictEqual(boss.takeBombDamage(1), false, 'Boss must reject damage during INTRO state');

  // 2. Advance through INTRO (1500ms)
  boss.update(1500);
  assert.strictEqual(boss.bossState, BossState.PHASE_1, 'Boss must transition to PHASE_1 after intro timer');

  // 3. Take Phase 1 damage down to 70% threshold (10 HP -> 7 HP)
  // Deliver a 2-bomb chain to trigger combo stun and phase transition
  assert.strictEqual(boss.takeBombDamage(2), true);
  boss.update(50);
  assert.strictEqual(boss.takeBombDamage(1), true);

  // Complete combo window (150ms total)
  boss.update(120);
  assert.strictEqual(boss.currentHp, 7);
  // Combo hits >= 2 triggers STUNNED state
  assert.strictEqual(boss.bossState, BossState.STUNNED);

  // Advance through stun duration (3.75s)
  boss.update(4000);
  // Recovers from stun: because hpRatio <= 0.70, transitions to INTERMISSION
  assert.strictEqual(boss.bossState, BossState.INTERMISSION);
  assert.strictEqual(boss.phase, 2);

  // Advance through INTERMISSION (1800ms)
  boss.update(1800);
  assert.strictEqual(boss.bossState, BossState.PHASE_2, 'Boss must enter PHASE_2 after intermission');

  // 4. Take Phase 2 damage down to 33% threshold (7 HP -> 3 HP)
  boss.update(1500); // expire post-intermission i-frames
  assert.strictEqual(boss.takeBombDamage(4), true);
  boss.update(160); // resolve combo
  assert.strictEqual(boss.currentHp, 3);
  assert.strictEqual(boss.bossState, BossState.ENRAGED, 'Boss must enter ENRAGED state at <= 33% HP');
  assert.strictEqual(boss.phase, 3);

  // 5. Lethal damage transitions to DEFEATED
  boss.update(1500); // expire i-frames
  assert.strictEqual(boss.takeBombDamage(3), true);
  assert.strictEqual(boss.currentHp, 0);
  assert.strictEqual(boss.bossState, BossState.DEFEATED);
  assert.strictEqual(boss.takeBombDamage(1), false, 'Boss must reject damage when DEFEATED');
});

/* ==============================================================================
 * SUITE 2: 150MS MULTI-BOMB COMBO BUFFER & STUN SCALING
 * ============================================================================== */

test('Boss 1.2: 150ms Multi-Bomb Combo Buffer — Chain blasts accumulate damage and extend stun window', () => {
  const boss = new TestFsmBoss(9);
  boss.update(1500); // Complete intro -> PHASE_1

  // Bomb 1 lands at t = 0ms
  assert.strictEqual(boss.takeBombDamage(1), true);
  assert.strictEqual(boss.comboHits, 1);
  assert.strictEqual(boss.isComboActive, true);

  // Bomb 2 lands at t = 60ms (within 150ms window)
  boss.update(60);
  assert.strictEqual(boss.takeBombDamage(1), true);
  assert.strictEqual(boss.comboHits, 2);

  // Bomb 3 lands at t = 110ms (within 150ms window)
  boss.update(50);
  assert.strictEqual(boss.takeBombDamage(1), true);
  assert.strictEqual(boss.comboHits, 3);
  assert.strictEqual(boss.currentHp, 6, 'All 3 buffered bombs must register damage');

  // Advance 50ms (total 160ms): buffer window expires
  boss.update(50);
  assert.strictEqual(boss.isComboActive, false);
  assert.strictEqual(boss.isStunned, true);

  // Stun scaling formula in BaseBoss: 3.0s + min(1.5, (comboHits - 1) * 0.75)
  // For 3 hits: 3.0 + min(1.5, 2 * 0.75) = 3.0 + 1.5 = 4.5s (4500ms)
  assert.strictEqual(boss.stunRemainingMs, 4500, '3-bomb combo must grant 4.5s extended stun');

  // Bomb 4 arrives at t = 200ms (post-combo i-frames active)
  assert.strictEqual(
    boss.takeBombDamage(1),
    false,
    'Blasts arriving during post-combo i-frames must be rejected'
  );
  assert.strictEqual(boss.currentHp, 6);
});

/* ==============================================================================
 * SUITE 3: 3-TIER TELEGRAPHS & FAIR ENCOUNTER GUARANTEE (>= 40% SAFE TILES)
 * ============================================================================== */

test('Boss 1.3: 3-Tier Telegraphs — Stages progress correctly and guarantee >= 40% walkable arena safety', () => {
  const tg = new TelegraphEngine();
  const COLS = 15;

  // Test King Gummy Bear Royal Leap (2x2 landing = 4 tiles + 1-tile cross shockwave = 8 tiles)
  const leapTiles = [
    4 * COLS + 5,
    4 * COLS + 6,
    5 * COLS + 5,
    5 * COLS + 6,
    3 * COLS + 5,
    6 * COLS + 5,
    4 * COLS + 4,
    4 * COLS + 7,
  ];
  const reg = tg.registerAttack(1, leapTiles, 2000);
  assert.strictEqual(reg.success, true);

  // At 2000ms: Tier 1 (Yellow)
  assert.strictEqual(tg.getTileTier(4, 5), TelegraphTier.YELLOW, 'At 2.0s remaining, telegraph must be Tier 1 (Yellow)');
  assert.ok(tg.getSafeWalkableRatio() >= 0.4, 'Safe area must be >= 40%');

  // Advance 600ms (1400ms remaining): Tier 1 (Yellow)
  tg.update(600);
  assert.strictEqual(tg.getTileTier(4, 5), TelegraphTier.YELLOW);

  // Advance 500ms (900ms remaining): Tier 2 (Amber)
  tg.update(500);
  assert.strictEqual(tg.getTileTier(4, 5), TelegraphTier.AMBER, 'At 900ms remaining, telegraph must be Tier 2 (Amber)');
  assert.strictEqual(tg.isTrajectoryLocked(1), true, 'Trajectory locks at Amber stage (<= 1.0s)');

  // Advance 500ms (400ms remaining): Tier 3 (Flashing Red)
  tg.update(500);
  assert.strictEqual(tg.getTileTier(4, 5), TelegraphTier.RED_FLASH, 'At 400ms remaining, telegraph must be Tier 3 (Crimson)');
});

/* ==============================================================================
 * SUITE 4: KING GUMMY BEAR SPECIFIC MECHANICS
 * ============================================================================== */

test('Boss 1.4: King Gummy Bear — Royal Leap landing pancake stun (2.2s) and Masterplay Lure (4.0s)', () => {
  const gummy = new GummyBearBoss();
  gummy.update(1500); // Complete intro

  // Case 1: Standard landing without bomb
  gummy.initiateRoyalLeap(200, 200);
  const res1 = gummy.land(false);
  assert.strictEqual(res1, 'STANDARD_LANDING');
  assert.strictEqual(gummy.stunRemainingMs, 2200, 'Standard landing must grant 2.2s stun');

  // Recover from stun
  gummy.update(2200);
  assert.strictEqual(gummy.isStunned, false);

  // Case 2: Masterplay lure with bomb primed on landing tile
  gummy.initiateRoyalLeap(280, 280);
  const res2 = gummy.land(true);
  assert.strictEqual(res2, 'MASTERPLAY_LURE');
  assert.strictEqual(gummy.stunRemainingMs, 4000, 'Masterplay lure must double stun to 4.0s');
  assert.strictEqual(gummy.currentHp, 8, 'Masterplay lure must deal instant 1 damage');
});

/* ==============================================================================
 * SUITE 5: CAPTAIN NIBBLES SPECIFIC MECHANICS
 * ============================================================================== */

test('Boss 1.5: Captain Nibbles — Kinetic Dash momentum and Head-On Collision Dizzy Stun (3.0s)', () => {
  const hamster = new HamsterBoss();
  hamster.update(1500); // Complete intro

  hamster.startDash({ x: 1, y: 0 });
  assert.strictEqual(hamster.isDashing, true);

  const hit = hamster.collideWithBombHeadOn();
  assert.strictEqual(hit, true);
  assert.strictEqual(
    hamster.isDashing,
    false,
    'Dash must stop immediately upon head-on collision'
  );
  assert.strictEqual(
    hamster.stunRemainingMs,
    3000,
    'Head-on bomb collision must trigger 3.0s dizzy stun'
  );
  assert.strictEqual(hamster.currentHp, 9);
});

/* ==============================================================================
 * SUITE 6: QUEEN BEE CUPCAKE SPECIFIC MECHANICS
 * ============================================================================== */

test('Boss 1.6: Queen Bee Cupcake — Aerial flight immunity, flower shields, and dive-bomb crater stun', () => {
  const queen = new QueenBeeBoss();
  queen.update(1500); // Complete intro

  // 1. Floor bomb damage rejected while flying
  assert.strictEqual(
    queen.takeFloorBombDamage(),
    false,
    'Flying queen must be immune to ground bomb flames'
  );

  // 2. Pop 4 shields
  queen.popShield();
  queen.popShield();
  queen.popShield();
  assert.strictEqual(queen.isFlying, true);
  queen.popShield();
  assert.strictEqual(queen.shieldsRemaining, 0);
  assert.strictEqual(queen.isFlying, false, 'Popping all 4 shields must ground the boss');
  assert.strictEqual(queen.stunRemainingMs, 3000, 'Popping shields must grant 3.0s stun');

  // 3. Dodged dive-bomb
  queen.update(3000); // Recover from shield stun
  queen.isFlying = true;
  const diveRes = queen.executeDiveBomb(true);
  assert.strictEqual(diveRes, 'CRATER_STUN');
  assert.strictEqual(
    queen.stunRemainingMs,
    2500,
    'Dodged dive-bomb must lodge boss into floor for 2.5s stun'
  );
});

/* ==============================================================================
 * SUITE 7: BOSS HUD STATE SYNCHRONIZATION & EVENT BRIDGE
 * ============================================================================== */

test('Boss 1.7: BossHUD — Segmented HP calculations, enrage gauge, and threat alert event dispatch', () => {
  const fakeGame = { events: new EventEmitter() };
  const hud = new BossHUD(fakeGame);

  // Full HP (9/9) King Gummy Bear: 3 segments of 3 HP
  hud.initBoss('king_gummy_bear', 9);
  const s1 = hud.getState();
  assert.strictEqual(s1.activeSegmentIndex, 2); // 3rd segment active
  assert.strictEqual(s1.activeSegmentHp, 3);
  assert.strictEqual(s1.activeSegmentMaxHp, 3);

  // Damaged to 5/9: 2nd segment active (2/3)
  hud.setHp(5);
  const s2 = hud.getState();
  assert.strictEqual(s2.activeSegmentIndex, 1);
  assert.strictEqual(s2.activeSegmentHp, 2);
  assert.strictEqual(s2.activeSegmentMaxHp, 3);

  // Damaged to 1/9: 1st segment active (1/3)
  hud.setHp(1);
  const s3 = hud.getState();
  assert.strictEqual(s3.activeSegmentIndex, 0);
  assert.strictEqual(s3.activeSegmentHp, 1);

  // Event Bridge emitter test
  let receivedEvent = null;
  fakeGame.events.on('boss-hud-update', (payload) => {
    receivedEvent = payload;
  });

  hud.setHp(6);
  assert.ok(receivedEvent !== null);
  assert.strictEqual(receivedEvent.bossId, 'king_gummy_bear');
  assert.strictEqual(receivedEvent.currentHp, 6);
  assert.strictEqual(receivedEvent.phase, 1);
});
```

---

## Section 3: Application Integration Hooks

### 3.1 `src/game/GameScene.ts` Integration Hooks

#### Step 1: Import Boss Deliverables
Add at the top of `src/game/GameScene.ts`:
```typescript
import {
  BaseBoss,
  BossState,
  GummyBearBoss,
  HamsterBoss,
  QueenBeeBoss,
  TelegraphEngine,
  BossHUD,
} from './bosses/index.ts';
```

#### Step 2: Add Class Properties to `GameScene`
Around line 976 in `GameScene`:
```typescript
  // Boss Subsystem Integration
  public activeBoss: BaseBoss | null = null;
  public telegraphEngine: TelegraphEngine | null = null;
  public telegraphGraphics: Phaser.GameObjects.Graphics | null = null;
  public bossGraphics: Phaser.GameObjects.Graphics | null = null;
  public bossHUD: BossHUD | null = null;
  public currentBossIndex: number = 0;
```

#### Step 3: Initialize in `create()`
Inside `create()` in `GameScene`:
```typescript
  // Initialize Boss HUD & Telegraph Renderers
  this.bossHUD = new BossHUD(this.game);
  this.telegraphGraphics = this.add.graphics({ depth: 5 });
  this.bossGraphics = this.add.graphics({ depth: 15 });
  this.telegraphEngine = new TelegraphEngine(this.telegraphGraphics);

  // Wire Game Mode Changes for Boss Encounters
  this.game.events.on('mode-changed', (mode: string) => {
    if (mode === 'boss_rush' || mode === 'BOSS_RUSH') {
      this.startBossEncounter('king_gummy_bear');
    } else if (this.activeBoss) {
      this.dismissBoss();
    }
  });
```

#### Step 4: Implement Boss Lifecycle Methods
Add to `GameScene`:
```typescript
  public startBossEncounter(bossId: string): void {
    this.dismissBoss();

    const startX = 300;
    const startY = 260;

    if (bossId === 'captain_nibbles' || bossId === 'boss_hamster_nibbles') {
      this.activeBoss = new HamsterBoss(startX, startY);
    } else if (bossId === 'queen_bee_cupcake' || bossId === 'boss_queen_bee') {
      this.activeBoss = new QueenBeeBoss(startX, startY);
    } else {
      this.activeBoss = new GummyBearBoss(startX, startY);
    }

    if (this.bossHUD) {
      this.bossHUD.initBoss(this.activeBoss.config.id as any, this.activeBoss.maxHp);
    }
  }

  public dismissBoss(): void {
    if (this.telegraphEngine) {
      this.telegraphEngine.reset();
    }
    if (this.telegraphGraphics) {
      this.telegraphGraphics.clear();
    }
    if (this.bossGraphics) {
      this.bossGraphics.clear();
    }
    if (this.bossHUD) {
      this.bossHUD.dismissBoss();
    }
    this.activeBoss = null;
  }
```

#### Step 5: Update Loop Hook in `update(_time, delta)`
Inside `update(_time: number, delta: number)`:
```typescript
  // Update Active Boss & Telegraphs
  if (this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED) {
    this.activeBoss.update(delta, this.player.x, this.player.y);

    if (this.telegraphEngine) {
      this.telegraphEngine.update(delta);
      this.telegraphEngine.render(_time);
    }

    if (this.bossHUD) {
      this.bossHUD.setHp(this.activeBoss.currentHp);
      this.bossHUD.setBossState(this.activeBoss.bossState);
      this.bossHUD.setEnrageGauge(this.activeBoss.enrageGauge);
    }

    // Render Procedural Boss Visuals
    if (this.bossGraphics) {
      this.bossGraphics.clear();
      const radius = this.activeBoss.config.colliderRadius || 35;

      // Outer glow / aura
      const themeColor = this.activeBoss.bossState === BossState.ENRAGED
        ? 0xff0044
        : this.activeBoss.bossState === BossState.STUNNED
          ? 0xf59e0b
          : 0x9333ea;

      this.bossGraphics.fillStyle(themeColor, 0.3);
      this.bossGraphics.fillCircle(this.activeBoss.x, this.activeBoss.y, radius + 8);

      // Core body
      this.bossGraphics.fillStyle(themeColor, 0.9);
      this.bossGraphics.fillCircle(this.activeBoss.x, this.activeBoss.y, radius);

      // Health ring / border
      this.bossGraphics.lineStyle(3, 0xffffff, 0.8);
      this.bossGraphics.strokeCircle(this.activeBoss.x, this.activeBoss.y, radius);

      // Stun Stars if stunned
      if (this.activeBoss.bossState === BossState.STUNNED) {
        this.bossGraphics.fillStyle(0xfff500, 1.0);
        for (let i = 0; i < 3; i++) {
          const starAngle = (_time / 200) + (i * (Math.PI * 2 / 3));
          const sx = this.activeBoss.x + Math.cos(starAngle) * (radius + 12);
          const sy = this.activeBoss.y - 10 + Math.sin(starAngle) * 8;
          this.bossGraphics.fillCircle(sx, sy, 4);
        }
      }
    }

    // Defeat check
    if (this.activeBoss.currentHp <= 0 || this.activeBoss.bossState === BossState.DEFEATED) {
      this.score += 5000;
      this.game.events.emit('currency-reward', { starCandies: 50, cosmicEssence: 25 });
      this.dismissBoss();
    }
  }
```

#### Step 6: Explosion Hit Registration
In the explosion handling logic (where bombs damage enemies), add boss collision:
```typescript
  if (this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED) {
    const dist = Phaser.Math.Distance.Between(blastX, blastY, this.activeBoss.x, this.activeBoss.y);
    if (dist < (this.activeBoss.config.colliderRadius || 35) + 20) {
      const hit = this.activeBoss.takeBombDamage(1, 'bomb');
      if (hit && this.bossHUD) {
        this.bossHUD.setHp(this.activeBoss.currentHp);
        if (this.activeBoss.bossState === BossState.STUNNED) {
          this.bossHUD.triggerStun(this.activeBoss.stunTimerMs / 1000, 'Bomb Blast Combo!');
        }
      }
    }
  }
```

---

### 3.2 `src/components/BombermanGame.tsx` Integration Hooks

#### Step 1: Import `BossHUDState`
In `src/components/BombermanGame.tsx`:
```typescript
import type { BossHUDState } from '../game/bosses/BossTypes';
```

#### Step 2: Add Component State
Inside `BombermanGame()`:
```typescript
const [bossHudState, setBossHudState] = useState<BossHUDState | null>(null);
```

#### Step 3: Wire Event Listener in Phaser `useEffect`
Inside the main game creation `useEffect`:
```typescript
// Boss HUD Event Bridge Listener
const handleBossHudUpdate = (hud: BossHUDState) => {
  setBossHudState(hud);
};
phaserGame.events.on('boss-hud-update', handleBossHudUpdate);
```

And in cleanup return function:
```typescript
if (phaserGameRef.current) {
  phaserGameRef.current.events.off('boss-hud-update', handleBossHudUpdate);
}
```

#### Step 4: Render Boss HUD UI
In the JSX, right above `<div ref={gameRef} ... />` inside the cabinet screen container:
```tsx
{/* Dynamic Boss HUD Overlay */}
{bossHudState && bossHudState.isActive && (
  <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[92%] max-w-md z-30 bg-slate-950/90 backdrop-blur-md rounded-xl border border-rose-500/50 p-2.5 shadow-2xl shadow-rose-950/50 pointer-events-none">
    {/* Nameplate & State Badges */}
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{bossHudState.avatarEmoji || '👑🐻'}</span>
        <div>
          <div className="text-xs font-bold text-white tracking-wide">{bossHudState.name}</div>
          <div className="text-[10px] text-rose-300/80 font-mono">{bossHudState.title}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {bossHudState.isStunned && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse">
            💫 STUNNED {((bossHudState.stunRemainingMs || 0) / 1000).toFixed(1)}s
          </span>
        )}
        {bossHudState.isEnraged && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-600/30 text-red-400 border border-red-500 animate-pulse">
            😡 ENRAGED
          </span>
        )}
      </div>
    </div>

    {/* Segmented HP Bars */}
    <div className="flex gap-1 h-3.5 bg-slate-900 rounded-full p-0.5 border border-slate-700 overflow-hidden mb-1.5">
      {bossHudState.phaseHpSegments.map((segMax, idx) => {
        const isPassed = idx < bossHudState.activeSegmentIndex;
        const isCurrent = idx === bossHudState.activeSegmentIndex;
        const pct = isPassed ? 0 : isCurrent ? (bossHudState.activeSegmentHp / segMax) * 100 : 100;
        return (
          <div key={idx} className="flex-1 bg-slate-800 rounded-full overflow-hidden relative">
            <div
              className="h-full transition-all duration-200"
              style={{
                width: `${pct}%`,
                backgroundColor: bossHudState.themeColor || '#ef4444',
              }}
            />
          </div>
        );
      })}
    </div>

    {/* Berserk Rage Gauge */}
    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-0.5">
      <span>BERSERK RAGE</span>
      <span className="text-rose-400 font-bold">{Math.floor(bossHudState.enrageGauge)}%</span>
    </div>
    <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
      <div
        className="h-full bg-gradient-to-r from-amber-500 to-rose-600 transition-all duration-300"
        style={{ width: `${Math.min(100, bossHudState.enrageGauge)}%` }}
      />
    </div>
  </div>
)}
```

---

## Section 4: Verification Protocol

To verify the integrity and success of the remediation:
1. **Module Import Verification**:
   ```bash
   node --experimental-strip-types -e "import('./src/game/bosses/index.ts').then(() => console.log('Bosses imported cleanly!'))"
   ```
   *Expected result*: Exits with code 0, outputs `Bosses imported cleanly!`.
2. **De-Mocked Test Suite Verification**:
   ```bash
   node --experimental-strip-types --test tests/bosses.test.mjs
   ```
   *Expected result*: Exits with code 0, 7 pass, 0 fail.
3. **Full Project Test Suite Pass**:
   ```bash
   npm test
   ```
   *Expected result*: Exits with code 0, 422 pass, 0 fail.
4. **Lint and Build Verification**:
   ```bash
   npm run lint
   npm run build
   ```
   *Expected result*: 0 lint errors, Turbopack builds successfully with exit code 0.
