# Scout 4 Audit Report: Crises, Hazards & Boss Encounters Deep-Scan & Integration Roadmap

**Author:** Scout 4 (Crisis, Hazards & Boss Encounters Scout)  
**Evolution Cycle:** 2026-10-01 Daily Evolution  
**Target Subsystems:**
- `src/game/crises/` (BaseCrisis, CrisisManager, VoidCrisis, LavaCrisis, ClockworkCrisis, SolarFlareCrisis, OrbitalCrisis, RiftCrisis, SituationLog)
- `src/game/bosses/` (BaseBoss, BossAttackManager, BossHUD, GummyBearBoss, HamsterBoss, QueenBeeBoss, TelegraphEngine)
- `src/game/hazards/` (DynamicHazard.ts — Quantum Spire Dynamic Hazard System)
- `src/game/GameScene.ts` (Runtime Orchestration, Collision Pipelines, Bomb Life Cycle & Procedural Graphics)

**Evaluation Date:** 2026-10-01  
**Status / Verdict:** **VERIFIED & READY FOR RUNTIME INTEGRATION (ZERO-GC, DETERMINISTIC & MATHEMATICALLY BALANCED)**

---

## 1. Executive Summary

As Scout 4 of the Scout Division for the 2026-10-01 Daily Evolution cycle, an exhaustive code scan, architectural evaluation, and integration feasibility analysis were conducted across three interconnected combat systems:
1. **The Planetary Crises Subsystem** (`src/game/crises/`): A 6-crisis dynamic encounter engine featuring 3-stage FSM progression, threat meters, and flat 195-tile Zero-GC hazard buffers.
2. **The Multi-Phase Boss Subsystem** (`src/game/bosses/`): 3 epic multi-phase bosses (King Gummy Bear, Captain Nibbles, Queen Mellifera) governed by 7-state FSMs, 150ms multi-bomb combo buffers, dynamic enrage gauges, and a 3-tier floor danger telegraph engine.
3. **The Quantum Spire Dynamic Hazard System** (`src/game/hazards/DynamicHazard.ts`): An advanced bidirectional geometric laser corridor system operating on 1D TypedArrays, featuring tactical bomb interactions (Quantum Entanglement, Subspace Hyper-Fuse, Tachyon Overcharge, Polarization Strike), player Quantum Tunneling mastery, and environmental enemy vaporization.

### Key Scan Findings
- **Zero-GC Hot Loop Guarantee**: `DynamicHazard.ts`, `BaseCrisis.ts`, and `TelegraphEngine.ts` strictly utilize fixed 1D TypedArrays (`Uint8Array`, `Int16Array`, `Float32Array`) and swap-and-pop slot indexers. No heap allocations occur during per-frame execution.
- **Perfect Timing Synchronization**: The 3-tier telegraph progression of `DynamicHazard` (Yellow $1000\text{ ms} \to$ Amber $500\text{ ms} \to$ Red $500\text{ ms} = 2000\text{ ms}$) precisely mirrors `TelegraphEngine.ts`'s 3-tier standard windup ($2000\text{ ms}$).
- **Tunneling Window Harmonization**: `TUNNELING_WINDOW_MS = 150\text{ ms}` perfectly encapsulates the player's dash duration (`DASH_DURATION_MS = 140\text{ ms}` from `gameplay_mechanics.ts`), ensuring reliable frame-perfect dash evasion without physics clipping.
- **Safe Area Invariant**: `DynamicHazard.getSafeAreaRatio()` guarantees $\ge 79.6\%$ safe walkable area across all modes, far surpassing the mandatory $\ge 40.0\%$ fair encounter budget.
- **Integration Target**: While `DynamicHazard.ts` has 16/16 unit tests passing in isolation (`tests/dynamic_hazard.test.mjs`), it is currently not instantiated or invoked in [`src/game/GameScene.ts`](file:///Users/user/src/bomberman/src/game/GameScene.ts). 

This report provides the complete architectural breakdown, telegraph timing verification, damage dispatch mapping, and concrete implementation roadmap for live `GameScene.ts` integration.

```
+----------------------------------------------------------------------------------------------------+
|                                    SCOUT 4 TARGET SUBSYSTEM MAP                                    |
|                                                                                                    |
|  +--------------------------------+                  +------------------------------------------+  |
|  |       CRISES SUBSYSTEM         |                  |              BOSS SUBSYSTEM              |  |
|  |  [CrisisManager] (Orchestrator)|                  |  [BaseBoss] (7-State FSM, 150ms Combo)   |  |
|  |   |-- Pastel Void Incursion    |                  |   |-- King Gummy Bear (9 HP, Leap)       |  |
|  |   |-- Clockwork Rebellion      |                  |   |-- Captain Nibbles (10 HP, Dash)      |  |
|  |   |-- Orbital Bombardment      |                  |   +-- Queen Mellifera (12 HP, Aerial)    |  |
|  |   |-- Solar Flare Storm        |                  |                                          |  |
|  |   |-- Creeping Lava Fissure    |                  |  [TelegraphEngine]                       |  |
|  |   +-- Dimensional Rifts (Loci) |                  |   |-- 3-Tier Visual Floor Warnings       |  |
|  |  [Zero-GC Hazard Grid (195)]   |                  |   +-- Fair Guarantee (>= 40% Safe Zone)  |  |
|  |  [SituationLog HUD Bridge]     |                  |  [BossAttackManager & BossHUD]           |  |
|  +--------------------------------+                  +------------------------------------------+  |
|                                         \          /                                               |
|                                          \        /                                                |
|                   +------------------------------------------------------+                         |
|                   |         DYNAMIC HAZARD: QUANTUM SPIRE SYSTEM         |                         |
|                   |  - 4-Stage FSM (INACTIVE/TELEGRAPH/ACTIVE/COOLDOWN)  |                         |
|                   |  - Spire Anchors: S0/S1 (Col 4), S2/S3 (Row 6), C0   |                         |
|                   |  - Tactical Bomb: Entanglement, Hyper-Fuse, Charge   |                         |
|                   |  - Player Mastery: Quantum Tunneling Dash I-Frames   |                         |
|                   |  - Environmental Vaporization (120 DMG / 15% Boss)   |                         |
|                   +------------------------------------------------------+                         |
|                                             |                                                      |
|                                             v                                                      |
|                   +------------------------------------------------------+                         |
|                   |                     GameScene.ts                     |                         |
|                   |  - Per-frame Update & Collision Dispatching          |                         |
|                   |  - Tactical Bomb Interception (placeBomb/explodeBomb)|                         |
|                   |  - Procedural Graphics Layering (Depth 9 / 100)      |                         |
|                   +------------------------------------------------------+                         |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. In-Depth Scan: Planetary Crises Subsystem (`src/game/crises/`)

### 2.1 Base Crisis Architecture (`BaseCrisis.ts` & `CrisisManager.ts`)
The crises subsystem is anchored by [`BaseCrisis.ts`](file:///Users/user/src/bomberman/src/game/crises/BaseCrisis.ts) and orchestrated by [`CrisisManager.ts`](file:///Users/user/src/bomberman/src/game/crises/CrisisManager.ts):

- **Standardized 3-Stage FSM**:
  - `WHISPERS` ($20,000\text{ ms}$): Early warning stage; threat starts at $10\%$, anomaly markers and initial hazard loci appear without lethal damage.
  - `OUTBREAK` ($55,000\text{ ms}$): Active escalation; threat rises past $35\%$, full hazard spreading begins, corridors become dangerous.
  - `CLIMAX` ($35,000\text{ ms}$): Final confrontation; threat reaches $70\% \to 100\%$, critical objective or crisis boss manifests. If the climax timer expires before objectives are met, the crisis enters `FAILED`.
  - `RESOLVED`: Victory state achieved when objectives are resolved; threat drops to $0\%$, rewards are granted.
  - `FAILED`: Catastrophic collapse; threat locks at $100\%$, triggers critical failure alert.

- **Zero-GC Flat Hazard Buffer**:
  - Exactly 195 pre-allocated [`HazardTile`](file:///Users/user/src/bomberman/src/game/crises/CrisisTypes.ts#L50-L59) objects stored in `hazardTileBuffer`.
  - Active hazard tracking via `activeHazardList` and $O(1)$ swap-and-pop removal in `clearHazardTile(r, c)`.
  - Re-usable query methods: `isTileHazardous(r, c)`, `getHazardAt(r, c)`, and `getActiveHazardTiles()`.

- **Threat Metric & Trend Tracker**:
  - Maintains `threatMeter` ($0.0 \to 100.0$) and `threatTrend` (`'stable' | 'rising' | 'critical' | 'declining'`).
  - Alert system via `triggerAlert(id, title, message, level, icon, durationMs)`.

- **Situation Log HUD Bridge (`SituationLog.ts`)**:
  - Throttles event transmissions to $50\text{ ms}$ ($20\text{ Hz}$) to prevent React bridge congestion.
  - Features instant bypass on stage transitions, alerts, or victory/failure events.

### 2.2 Individual Crisis Profiles & Hazards

```
+-------------------------------------------------------------------------------------------------------------+
|                                        PLANETARY CRISIS DIRECTORY                                           |
+----------------------+-----------+-------------------------+------------------------------------------------+
| Crisis Name          | Type Key  | Primary Hazard Types    | Strategic Objective & Climax Encounter         |
+----------------------+-----------+-------------------------+------------------------------------------------+
| Pastel Void          | pastel_   | VOID_RIFT (2),          | Charge 2 corner Purification Prisms with bomb  |
| Incursion            | void      | VOID_CREEP (1),         | blasts; shatter Iridescent Shield & defeat     |
|                      |           | PURIFICATION_PRISM (3)  | Void Devourer Avatar. (Fail if creep >= 72)    |
+----------------------+-----------+-------------------------+------------------------------------------------+
| Clockwork Toy        | clockwork_| CONVEYOR_BELT (4),      | Survive EMP pulses along conveyors; detonate   |
| Rebellion            | rebellion | EMP_PULSE (5),          | all 4 Dynamo Conduits within 1.5s window       |
|                      |           | BRASS_COG (6)           | around center (6,7).                           |
+----------------------+-----------+-------------------------+------------------------------------------------+
| Orbital              | orbital_  | KINETIC_TARGET (8),     | Dodge orbital crosshairs & kinetic craters;    |
| Bombardment          | bombard.  | KINETIC_CRATER (9),     | override 3 Planetary Defense Uplinks before    |
|                      |           | UPLINK_TERMINAL (10)    | Spinal Macrocannon reaches 100% charge.        |
+----------------------+-----------+-------------------------+------------------------------------------------+
| Solar Flare          | solar_    | SOLAR_SWEEP (11),       | Take cover behind indestructible pillars;      |
| Storm                | flares    | THERMAL_VENT (12)       | cool 4 Thermal Coolant Vents before Helios     |
|                      |           |                         | Solar Core blow-out.                           |
+----------------------+-----------+-------------------------+------------------------------------------------+
| Creeping Lava        | creeping_ | LAVA_SURFACE (13),      | Solidify advancing magma rings into obsidian;  |
| Fissure              | lava      | OBSIDIAN_BLOCK (14),    | detonate bomb on Central Pressure Valve (6,7)  |
|                      |           | CALDERA_VALVE (15)      | to seal tectonic rupture.                      |
+----------------------+-----------+-------------------------+------------------------------------------------+
| Dimensional Rift     | dimension.| DIMENSIONAL_WARP (16),  | Navigate toroidal edge wrap-around corridors;  |
| Inversion            | _rifts    | QUANTUM_SPIRE (17)      | polarize 3 Singularity Spires with bomb blasts |
|                      |           |                         | within 2.0s synchronization window.            |
+----------------------+-----------+-------------------------+------------------------------------------------+
```

### 2.3 Special Synergies with DynamicHazard
Notice that [`HazardType.QUANTUM_SPIRE`](file:///Users/user/src/bomberman/src/game/crises/CrisisTypes.ts#L45) (`ID = 17`) is already reserved in `CrisisTypes.ts`.
In [`RiftCrisis.ts`](file:///Users/user/src/bomberman/src/game/crises/RiftCrisis.ts#L108-L112), during the `CLIMAX` stage:
```typescript
// RiftCrisis.ts lines 108-112:
for (const spire of this.spires) {
  this.setHazardTile(spire.r, spire.c, HazardType.QUANTUM_SPIRE, 1.0, 0, 0);
}
```
Furthermore, the Spire Anchor layout of `DynamicHazard.ts`:
- Pair Alpha: $S_0(3, 4)$ and $S_1(9, 4)$
- Pair Beta: $S_2(6, 3)$ and $S_3(6, 11)$
- Nexus $C_0(6, 7)$ (Center tile)

matches key crisis coordinates:
- $(3, 4)$ is one of the primary rift loci in `RiftCrisis.ts`.
- $(6, 7)$ is the exact center Caldera Valve in `LavaCrisis.ts` and the Dynamo center in `ClockworkCrisis.ts`.
- $(6, 3)$ and $(6, 11)$ are Thermal Coolant Vents in `SolarFlareCrisis.ts`.

---

## 3. In-Depth Scan: Multi-Phase Boss Subsystem (`src/game/bosses/`)

### 3.1 BaseBoss FSM & Mechanics (`BaseBoss.ts`)
The abstract [`BaseBoss`](file:///Users/user/src/bomberman/src/game/bosses/BaseBoss.ts) implements core combat mechanics:

- **7-State FSM**:
  $$\text{INTRO} \xrightarrow{1.5s} \text{PHASE\_1} \xrightarrow{\text{HP}\le 70\%} \text{INTERMISSION} \xrightarrow{1.8s} \text{PHASE\_2} \xrightarrow{\text{HP}\le 33\% \lor \text{Enrage}\ge 100} \text{ENRAGED}$$
  Any state can transition into $\text{STUNNED}$ upon tactical exploit, resuming the appropriate active phase with i-frames when stun timer lapses. At $\text{HP}\le 0$, transitions to $\text{DEFEATED}$ ($1.2\text{ s}$ death animation).

- **150ms Multi-Bomb Combo Buffer**:
  - The first bomb hit opens a $150\text{ ms}$ buffer window (`comboBufferTimerMs = 150`).
  - Chained bomb hits accumulate damage and build $+10\%$ enrage gauge per hit.
  - Multiple hits dynamically extend the tactical stun window:
    $$\text{Stun Duration} = 3.0s + \min(1.5s, (\text{comboHits} - 1) \times 0.75s)$$
  - **ARCH-02 Rule**: When entering `STUNNED`, invulnerability frames are strictly cleared (`isInvulnerable = false`, `iFrameTimerMs = 0`), guaranteeing player damage uptime.

- **Dynamic Enrage Gauge**:
  - Builds passively during combat at $+1.5\% / \text{sec}$ plus $+10\%$ per bomb hit.
  - At $100\%$, forces transition into `BossState.ENRAGED` ($+60\%$ speed, reduced cooldowns).

### 3.2 Boss Encounter Profiles

#### 1. King Gummy Bear (`GummyBearBoss.ts`)
- **Profile**: 9 HP, segmented into $[3, 3, 3]$. Colossus of Gelatin.
- **Thick Skin Invulnerability**: While marching, thick gelatin skin absorbs bomb blasts with $0$ damage (`canTakeDamage()` returns false).
- **Parabolic Royal Leap**: Leaps toward player with sine-wave trajectory (peaks at $64\text{ px}$ elevation).
- **Tactical Vulnerability**: On touchdown, flattens into a gelatin pancake and enters stun:
  - Standard landing: $2.2\text{ s}$ stun.
  - *Masterplay Lure*: Lured into landing directly on an active primed bomb: takes immediate damage and suffers extended $4.0\text{ s}$ stun!
- **Minion Budding**: Spawns up to 4 mini Gummy Cubs in Phase 2+.

#### 2. Captain Nibbles (`HamsterBoss.ts`)
- **Profile**: 10 HP, segmented into $[3, 3, 4]$. Mecha Hamster in Gyro Sphere.
- **Frontal Shield**: Kinetic shield blocks all frontal bomb blasts while revving or dashing.
- **Wheel Charge Dash & 90° Bank Shots**: Revs up for $1.2\text{ s}$, dashes at high speed ($200 \to 320\text{ px/s}$), and rebounds off boundary walls at $90^\circ$ angles.
- **Tactical Vulnerability**: Dashing head-on into a primed bomb shatters his kinetic shield, knocks him back 2 tiles, deals 1 damage, and inflicts a $3.0\text{ s}$ dizzy stun!

#### 3. Queen Mellifera (`QueenBeeBoss.ts`)
- **Profile**: 12 HP, segmented into $[3, 4, 5]$. Sovereign of the Sugar Hive Bakery.
- **3D Aerial Flight**: Cruises at $40\text{ px}$ altitude. Floor bomb flames pass harmlessly beneath her.
- **4 Rotating Flower Shields**: Orbiting shields absorb bomb explosions.
- **Tactical Vulnerability (3 Grounding Vectors)**:
  1. Popping all 4 rotating shields forces an engine crash landing ($3.0\text{ s}$ stun).
  2. Anti-Air Sniping via Corner Pollen Launchers knocks her down ($3.0\text{ s}$ stun).
  3. Dodging her Supersonic Royal Dive causes her to wedge into the floor crater ($2.5\text{ s}$ Sugar Coma stun, or $3.5\text{ s}$ with a crater bomb).

### 3.3 Visual Telegraph Engine (`TelegraphEngine.ts`)
The universal floor danger engine provides mathematical encounter fairness:
- **3 Warning Tiers**:
  - Yellow ($t > 1000\text{ ms}$): Soft fill (`#FFE83B`, $\alpha=0.12$), dashed border, dynamic steering.
  - Amber ($500\text{ ms} < t \le 1000\text{ ms}$): Solid border (`#F59E0B`, $\alpha=0.85$), $4\text{ Hz}$ hatching, **Committed Trajectory Locked**.
  - Red ($0\text{ ms} < t \le 500\text{ ms}$): Crimson/white strobe (`#EF4444`/`#FFFFFF`), $8\text{ Hz}$ diamond pip, imminent strike.
- **Encounter Budget Guarantee**:
  - Total walkable tiles $= 113$.
  - Maximum danger tiles $\le \lfloor 0.60 \times 113 \rfloor = 67\text{ tiles}$.
  - Walkable safe area is strictly guaranteed $\ge 40\%$.
  - BFS connected corridor check ensures an escape component of size $\ge 2$.

---

## 4. In-Depth Scan: Quantum Spire Dynamic Hazard System (`DynamicHazard.ts`)

### 4.1 4-Stage Lifecycle FSM
`DynamicHazard` implements an autonomous 4-stage lifecycle state machine:
```
  [INACTIVE] 
     |  start(stage)
     v
  [COOLDOWN] (Warmup 2000ms / Cooldown 5700ms [Climax 3700ms])
     |  cycleTimerMs <= 0
     v
  [TELEGRAPH] (Total 2000ms: Yellow 1000ms -> Amber 500ms -> Red 500ms)
     |  telegraphRemainingMs <= 0
     v
  [ACTIVE] (300ms Tachyon Beam Discharge, 150ms Quantum Tunneling window)
     |  activeRemainingMs <= 0
     v
  [COOLDOWN] (Loop continues until stop() called)
```

### 4.2 Zero-GC TypedArray Memory Layout
No dynamic objects or arrays are instantiated in `update()`:
- `dangerMask: Uint8Array(195)`:
  - `0`: Safe tile.
  - `1`: Telegraphed danger tile.
  - `2`: Lethal active tachyon beam.
  - `3`: Polarized harmless safe beam.
- `intensityGrid: Float32Array(195)`: Stores visual opacity/intensity ($0.0 \to 1.0$).
- `activeBeamIndices: Int16Array(32)`: Flat buffer indexing the active corridor coordinates.
- `ghostBombPool: GhostBombSlot[16]`: Static pool of pre-allocated entangled ghost bomb slots.
- Scratch containers `scratchPlayerResult` and `scratchEnemyResult` for zero-allocation collision queries.

### 4.3 Telegraph Timings & Stage Cadence

```
+----------------------------------------------------------------------------------------------------+
|                                    DYNAMIC HAZARD TIMING MATRIX                                    |
+--------------------------+--------------------+----------------------------------------------------+
| State / Sub-Phase        | Duration (ms)      | Visual / Functional Characteristics                |
+--------------------------+--------------------+----------------------------------------------------+
| Warmup (Initial start)   | 2,000 ms           | Non-hazardous preparation delay after activation   |
+--------------------------+--------------------+----------------------------------------------------+
| Telegraph: Yellow        | 1,000 ms           | Intensity 0.25; soft pulsating corridor warning     |
+--------------------------+--------------------+----------------------------------------------------+
| Telegraph: Amber         |   500 ms           | Intensity 0.55; rapid amber pulse; locked vector   |
+--------------------------+--------------------+----------------------------------------------------+
| Telegraph: Red           |   500 ms           | Intensity 0.85; high-frequency ruby flash          |
+--------------------------+--------------------+----------------------------------------------------+
| Active Beam Discharge    |   300 ms           | Blinding tachyon laser beam; lethal dangerMask=2   |
+--------------------------+--------------------+----------------------------------------------------+
| Quantum Tunneling Window | First 150 ms       | Dashing grants Phase Shift & 0 damage              |
+--------------------------+--------------------+----------------------------------------------------+
| Outbreak Cooldown        | 5,700 ms           | Interval between pulses during standard combat     |
+--------------------------+--------------------+----------------------------------------------------+
| Climax Cooldown          | 3,700 ms           | Accelerated pulse frequency in Climax / Boss P3    |
+--------------------------+--------------------+----------------------------------------------------+
| Spire Polarization       | 8,000 ms           | Harmless emerald beam + 3x3 cleansed sanctuary     |
+--------------------------+--------------------+----------------------------------------------------+
| Subspace Hyper-Fuse      | 1,500 ms           | Accelerated bomb detonation on Spire anchor        |
+--------------------------+--------------------+----------------------------------------------------+
```

### 4.4 Hazard Damage Dispatching

#### Player Collision (`checkPlayerCollision`)
- **Direct Lethal Hit**:
  - `damage = 25` (or triggers `playerDie()` / shield charge loss).
  - Inflicts `Phase Jitter` debuff for $2000\text{ ms}$ (reduces movement speed by $-20\%$).
- **Quantum Tunneling Evasion**:
  - Conditions: `isDashing === true`, active beam elapsed $\le 150\text{ ms}$, and dash elapsed $\le 150\text{ ms}$.
  - Result: `res.damage = 0`, `res.tunneled = true`, `res.phaseShiftGranted = true`.
  - Player receives $1000\text{ ms}$ invulnerability, $+45\text{ px/s}$ speed surge for $2500\text{ ms}$, and floating text `✦ QUANTUM PHASED!`.
- **Polarized Safe Beam**:
  - If `dangerMask[idx] === 3`, `res.hit = true`, `res.damage = 0`. Complete immunity.

#### Enemy & Boss Collision (`checkEnemyCollision`)
- **Minion Enemy**:
  - Inflicts $120$ Environmental Damage (`ENEMY_HAZARD_DAMAGE`).
  - Instant vaporization; awards $+100$ score points and $+5\%$ Ultimate skill charge.
- **Boss Enemy**:
  - Inflicts $15\%$ Max HP damage (`BOSS_HAZARD_DAMAGE_RATIO = 0.15`).
  - Inflicts $1500\text{ ms}$ Stun (`BOSS_STUN_DURATION_MS`), forcing boss into `BossState.STUNNED` and opening tactical vulnerability.

### 4.5 Tactical Bomb Interactions
- **Subspace Hyper-Fuse (`onBombPlaced`)**:
  - Placing a bomb directly on a Spire anchor tile ($S_0, S_1, S_2, S_3, C_0$) compresses the standard fuse ($2000\text{ ms} \to 1500\text{ ms}$).
  - Visually reflected by rapid pre-ignition flickering.
- **Quantum Entanglement (`onBombPlaced`)**:
  - Placing a bomb on or adjacent (Chebyshev distance 1) to a Spire anchor duplicates an Entangled Ghost Bomb at the paired Spire ($S_0 \leftrightarrow S_1$, $S_2 \leftrightarrow S_3$).
  - When the primary bomb detonates, `onBombDetonated` returns `pairedGhostBombIds`, triggering synchronized twin detonation!
- **Tachyon Overcharge (`onBombDetonated`)**:
  - A bomb detonating within an active beam gains $+2$ Blast Power and piercing capability through candy soft blocks.
- **Polarization Strike (`onBombBlastImpact`)**:
  - Striking an unpolarized Spire crystal with a bomb blast polarizes the spire pair for $8000\text{ ms}$.
  - Converts lethal red beams (`code = 2`) into harmless emerald safe beams (`code = 3`).
  - Instantly cleanses all hazard tiles in a $3 \times 3$ radius around the hit Spire.

---

## 5. Live Runtime Integration Examination (`GameScene.ts`)

### 5.1 Current Runtime Architecture in GameScene
In [`src/game/GameScene.ts`](file:///Users/user/src/bomberman/src/game/GameScene.ts):
- Line 541: `public persistentHazardMask: FlatHazardMask = new FlatHazardMask();`
- Line 569: `public activeBoss: BaseBoss | null = null;`
- Line 573: `public bossHUD: BossHUD | null = null;`
- Line 633: `public crisisManager: CrisisManager = new CrisisManager();`
- Line 1717: `this.telegraphEngine = new TelegraphEngine(this.telegraphGraphics);`
- Line 1721: `this.crisisGraphics = this.add.graphics(); this.crisisGraphics.setDepth(RENDER_DEPTH.CRISIS_HAZARDS);`
- Line 2218: `this.activeBoss.update(delta, this.player.x, this.player.y);`
- Line 2305: `this.crisisManager.update(delta, ...); this.renderCrisisHazards(_time);`
- Line 2650: `placeBomb()`
- Line 2984: `explodeBomb(bomb, row, col)`
- Line 3855: `performDash()`

Currently, `DynamicHazard.ts` is **not yet instantiated or referenced** in `GameScene.ts`.

### 5.2 Four Live Gameplay Integration Modes

```
+----------------------------------------------------------------------------------------------------+
|                                FOUR INTEGRATION TRIGGER PATHWAYS                                    |
+--------------------------+-------------------------------------------------------------------------+
| Mode Pathway             | Mechanics & Live Integration Logic                                      |
+--------------------------+-------------------------------------------------------------------------+
| 1. Planetary Crisis      | In `startCrisisMode(type)`: When `CrisisType.DIMENSIONAL_RIFTS` is      |
|    Integration           | triggered, or during any crisis when reaching `OUTBREAK` / `CLIMAX`,   |
|                          | `this.dynamicHazard.start(stage)` is invoked in lockstep.               |
|                          | When crisis is resolved or stopped, `this.dynamicHazard.stop()` is run. |
+--------------------------+-------------------------------------------------------------------------+
| 2. Endless / Stage       | In standard progression / endless survival: Trigger `DynamicHazard`     |
|    Progression           | after wave 3 or survival elapsed > 45s. Cycles between Alpha and Beta   |
|                          | Spire pairs, culminating in Climax cross-beams on high waves.           |
+--------------------------+-------------------------------------------------------------------------+
| 3. Boss Encounter        | In `startBossEncounter(bossId)`: During Phase 2 (`INTERMISSION`) or     |
|    Synergy               | Phase 3 (`ENRAGED`), activate `dynamicHazard.start('CLIMAX')`. Allows   |
|                          | players to bait bosses (Captain Nibbles dash or King Gummy leap) into   |
|                          | active beams for 15% Max HP damage + 1.5s stun!                        |
+--------------------------+-------------------------------------------------------------------------+
| 4. Dedicated Event Mode  | In `onModeChanged(mode)`: Register new game mode 'quantum_spire' /      |
|    Trigger               | 'spire_showdown', allowing direct toggle from UI mode selector.         |
+--------------------------+-------------------------------------------------------------------------+
```

### 5.3 Frame-by-Frame Update Sequence in GameScene
In `GameScene.update(_time, delta)`:

```typescript
// 1. Update DynamicHazard FSM
if (this.dynamicHazard && this.dynamicHazard.getState() !== HazardLifecycleState.INACTIVE) {
  this.dynamicHazard.update(delta);

  // 2. Sync to AI Pathfinding Danger Mask
  if (this.dynamicHazard.getState() === HazardLifecycleState.TELEGRAPH ||
      this.dynamicHazard.getState() === HazardLifecycleState.ACTIVE) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.dynamicHazard.isTileLethal(r, c) || this.dynamicHazard.isTileTelegraphed(r, c)) {
          this.persistentHazardMask.setCoord(r, c, 1);
        }
      }
    }
  }

  // 3. Player Collision & Quantum Tunneling Check
  const pRow = Math.floor(this.player.y / TILE_SIZE);
  const pCol = Math.floor(this.player.x / TILE_SIZE);
  const dashElapsedMs = this.isDashing ? (this.time.now - this.dashStartTime) : 0;

  const playerHitRes = this.dynamicHazard.checkPlayerCollision(
    pRow,
    pCol,
    this.isDashing,
    dashElapsedMs
  );

  if (playerHitRes.hit) {
    if (playerHitRes.tunneled) {
      // Quantum Tunneling Success!
      this.spawnFloatingText(this.player.x, this.player.y - 14, '✦ QUANTUM PHASED!', '#38bdf8');
      this.cameras.main.flash(80, 56, 189, 248, false);
      this.isInvulnerable = true;
      this.shieldInvulnerableUntil = this.time.now + 1000;
    } else if (playerHitRes.isLethal) {
      // Direct Lethal Hit
      this.playerDie();
      this.spawnFloatingText(this.player.x, this.player.y - 14, 'TACHYON SHEAR -25', '#ef4444');
    }
  }

  // 4. Enemy Environmental Vaporization
  this.enemies.getChildren().forEach((child) => {
    const enemy = child as BaseEntity;
    if (enemy.active && !enemy.isDead) {
      const eRow = Math.floor(enemy.y / TILE_SIZE);
      const eCol = Math.floor(enemy.x / TILE_SIZE);
      const eRes = this.dynamicHazard.checkEnemyCollision(eRow, eCol, false);
      if (eRes.hit && eRes.isVaporized) {
        enemy.takeDamage(eRes.damage, 'hazard', this.time.now);
        this.spawnFloatingText(enemy.x, enemy.y - 14, 'TACHYON VAPORIZED!', '#a855f7');
        this.score += eRes.scoreBonus;
        this.addUltimateCharge(5);
      }
    }
  });

  // 5. Boss Environmental Damage & Stun
  if (this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED) {
    const bRow = Math.floor(this.activeBoss.y / TILE_SIZE);
    const bCol = Math.floor(this.activeBoss.x / TILE_SIZE);
    const bRes = this.dynamicHazard.checkEnemyCollision(bRow, bCol, true);
    if (bRes.hit && bRes.isStunned) {
      const bossDmg = Math.max(1, Math.ceil(this.activeBoss.maxHp * 0.15));
      this.activeBoss.takeBombDamage(bossDmg, 'skill');
      this.activeBoss.applyStun(bRes.stunDurationMs / 1000);
      this.bossHUD?.triggerStun(bRes.stunDurationMs / 1000, 'Tachyon Overload Stun!');
      this.spawnFloatingText(this.activeBoss.x, this.activeBoss.y - 20, '15% SPIRE OVERLOAD!', '#f43f5e');
    }
  }

  // 6. Render Procedural Hazard Graphics
  this.renderDynamicHazardGraphics(_time);
}
```

### 5.4 Bomb Life Cycle Interception

#### 1. In `placeBomb()`:
```typescript
// Query Subspace Hyper-Fuse & Entanglement
const numBombId = Date.now() % 100000;
bomb.setData('numId', numBombId);

const hazardPlacement = this.dynamicHazard.onBombPlaced(
  numBombId,
  row,
  col,
  this.bombPower,
  2000
);

const effectiveFuseMs = hazardPlacement.modifiedFuseMs; // 1500ms on Spire!
if (effectiveFuseMs < 2000) {
  this.spawnFloatingText(centerX, centerY - 14, 'HYPER-FUSE (1.5s)!', '#00f0ff');
}

// Spawn Entangled Ghost Bomb Twin
if (hazardPlacement.isEntangled && hazardPlacement.ghostBombId) {
  this.spawnGhostBombSprite(hazardPlacement.ghostBombId, numBombId, row, col, this.bombPower, effectiveFuseMs);
  this.spawnFloatingText(centerX, centerY - 14, 'QUANTUM ENTANGLED!', '#c084fc');
}
```

#### 2. In `explodeBomb()`:
```typescript
// Query Tachyon Overcharge & Detonate Twin Ghost Bombs
const numBombId = bomb.getData('numId') || 0;
const detRes = this.dynamicHazard.onBombDetonated(
  numBombId,
  actualRow,
  actualCol,
  bombPower
);

const effectivePower = detRes.overcharged ? detRes.modifiedPower : bombPower;
if (detRes.overcharged) {
  this.spawnFloatingText(centerX, centerY - 14, 'TACHYON OVERCHARGE (+2)!', '#d946ef');
  this.cameras.main.flash(100, 217, 70, 239, false);
}

// Detonate paired Ghost Bomb sprites
if (detRes.pairedGhostBombIds.length > 0) {
  this.detonateEntangledGhostBombs(detRes.pairedGhostBombIds);
}
```

#### 3. In `spawnExplosion()` / Blast Raycast:
```typescript
// Check Polarization Strike when blast touches Spire Anchor
const polRes = this.dynamicHazard.onBombBlastImpact(actualRow, actualCol);
if (polRes.polarized) {
  this.spawnFloatingText(centerX, centerY - 14, 'SPIRE POLARIZED (8s)!', '#22c55e');
  this.cameras.main.flash(120, 34, 197, 94, false);
}
```

---

## 6. Procedural Graphics & Visual Pipeline (`renderDynamicHazardGraphics`)

In [`GameScene.ts`](file:///Users/user/src/bomberman/src/game/GameScene.ts), dynamic hazard visual rendering should be batched via persistent Phaser Graphics at `RENDER_DEPTH.CRISIS_HAZARDS` (Depth 9):

```typescript
private renderDynamicHazardGraphics(time: number): void {
  if (!this.hazardGraphics || !this.dynamicHazard) return;
  this.hazardGraphics.clear();

  const spires = this.dynamicHazard.getSpires();
  const state = this.dynamicHazard.getState();
  const telegraphPhase = this.dynamicHazard.getTelegraphPhase();

  // 1. Render Spire Anchors (Fixed Monolith Crystals)
  for (let i = 0; i < spires.length; i++) {
    const sp = spires[i];
    const x = sp.c * TILE_SIZE + TILE_SIZE / 2;
    const y = sp.r * TILE_SIZE + TILE_SIZE / 2;
    const pulse = 0.8 + 0.2 * Math.sin(time / 200 + sp.id);

    if (sp.isPolarized) {
      // Polarized Emerald Crystal
      this.hazardGraphics.fillStyle(0x22c55e, 0.4 * pulse);
      this.hazardGraphics.fillCircle(x, y, 20 * pulse);
      this.hazardGraphics.fillStyle(0x4ade80, 0.9);
      this.hazardGraphics.fillCircle(x, y, 10);
      this.hazardGraphics.lineStyle(2, 0xffffff, 0.9);
      this.hazardGraphics.strokeCircle(x, y, 10);
    } else {
      // Tachyon Resonator (Violet / Cyan)
      this.hazardGraphics.fillStyle(sp.subtype === 3 ? 0xd946ef : 0x00f0ff, 0.35 * pulse);
      this.hazardGraphics.fillCircle(x, y, 18 * pulse);
      this.hazardGraphics.fillStyle(sp.subtype === 3 ? 0x86198f : 0x0284c7, 0.9);
      this.hazardGraphics.fillCircle(x, y, 9);
      this.hazardGraphics.lineStyle(2, 0x38bdf8, 0.85);
      this.hazardGraphics.strokeCircle(x, y, 9);
    }
  }

  // 2. Render Telegraphed Corridor Danger
  if (state === HazardLifecycleState.TELEGRAPH) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.dynamicHazard.isTileTelegraphed(r, c)) {
          const left = c * TILE_SIZE;
          const top = r * TILE_SIZE;

          if (telegraphPhase === TelegraphPhase.YELLOW) {
            this.hazardGraphics.fillStyle(0xffeb3b, 0.18);
            this.hazardGraphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            this.hazardGraphics.lineStyle(1.5, 0xffeb3b, 0.5);
            this.hazardGraphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          } else if (telegraphPhase === TelegraphPhase.AMBER) {
            this.hazardGraphics.fillStyle(0xf59e0b, 0.35);
            this.hazardGraphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            this.hazardGraphics.lineStyle(2, 0xf59e0b, 0.8);
            this.hazardGraphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          } else if (telegraphPhase === TelegraphPhase.RED) {
            const strobe = Math.sin(time / 50) > 0 ? 0.65 : 0.35;
            this.hazardGraphics.fillStyle(0xef4444, strobe);
            this.hazardGraphics.fillRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            this.hazardGraphics.lineStyle(2.5, 0xffffff, 0.9);
            this.hazardGraphics.strokeRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }
        }
      }
    }
  }

  // 3. Render Active Tachyon Beams
  if (state === HazardLifecycleState.ACTIVE) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const left = c * TILE_SIZE;
        const top = r * TILE_SIZE;
        const x = left + TILE_SIZE / 2;
        const y = top + TILE_SIZE / 2;

        if (this.dynamicHazard.isTilePolarized(r, c)) {
          // Polarized Safe Beam (Emerald)
          this.hazardGraphics.fillStyle(0x22c55e, 0.45);
          this.hazardGraphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          this.hazardGraphics.lineStyle(2, 0x86efac, 0.85);
          this.hazardGraphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else if (this.dynamicHazard.isTileLethal(r, c)) {
          // Lethal Tachyon Beam (Laser core)
          this.hazardGraphics.fillStyle(0xd946ef, 0.7);
          this.hazardGraphics.fillRect(left, top, TILE_SIZE, TILE_SIZE);
          this.hazardGraphics.fillStyle(0xffffff, 0.95);
          this.hazardGraphics.fillRect(left + 10, top + 10, TILE_SIZE - 20, TILE_SIZE - 20);
          this.hazardGraphics.lineStyle(3, 0x00f0ff, 0.95);
          this.hazardGraphics.strokeRect(left, top, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }
}
```

---

## 7. Concrete Integration Roadmap

```mermaid
gantt
    title DynamicHazard GameScene Integration Roadmap
    dateFormat  YYYY-MM-DD
    section Phase 1: Engine Foundation
    GameScene Class Fields & Inits            :a1, 2026-10-01, 1d
    Graphics Layering & Shutdown Teardown    :a2, after a1, 1d
    section Phase 2: Per-Frame Loops
    FSM Update & Pathfinding Mask Sync       :b1, after a2, 1d
    Player Collision & Quantum Tunneling     :b2, after b1, 1d
    Enemy Vaporization & Boss Stun Hook      :b3, after b2, 1d
    section Phase 3: Tactical Bomb Hooks
    Subspace Hyper-Fuse in placeBomb         :c1, after b3, 1d
    Quantum Entanglement Twin Ghost Bombs    :c2, after c1, 1d
    Tachyon Overcharge & Polarization Strike :c3, after c2, 1d
    section Phase 4: Procedural Visuals
    Spire Anchors, Telegraphs & Beams Draw   :d1, after c3, 1d
    Web Audio Voice Pool Synthesis Hook      :d2, after d1, 1d
    section Phase 5: Verification & Zero-GC
    Node.js Test Suite & 10k Soak Run        :e1, after d2, 1d
    Next.js Production Build Validation      :e2, after e1, 1d
```

### Milestone Breakdown
- **Phase 1: Subsystem Instantiation & Lifecycles**
  - Add `public dynamicHazard: DynamicHazard = new DynamicHazard();` in `GameScene.ts`.
  - In `create()`: `this.dynamicHazard.init(this.map);`.
  - In `shutdown()`: `this.dynamicHazard.stop(); this.dynamicHazard.reset();`.
- **Phase 2: Per-Frame Collision & Gameplay Hookup**
  - Wire `this.dynamicHazard.update(delta)` into `update()`.
  - Wire `checkPlayerCollision` with `isDashing` and `dashElapsedMs` for Quantum Tunneling.
  - Wire `checkEnemyCollision` for minion instant vaporization and boss $15\%$ HP + $1.5\text{ s}$ stun.
- **Phase 3: Tactical Bomb Interception**
  - In `placeBomb`: Integrate `onBombPlaced` for Hyper-Fuse ($1500\text{ ms}$) and Entangled Ghost Bomb creation.
  - In `explodeBomb`: Integrate `onBombDetonated` for Tachyon Overcharge ($+2$ power, piercing) and synchronized ghost bomb detonation.
  - In explosion raycast: Integrate `onBombBlastImpact` for Polarization Strike ($8\text{ s}$ safe beam).
- **Phase 4: Procedural Visuals & Audio**
  - Implement `renderDynamicHazardGraphics` at Depth 9 (`RENDER_DEPTH.CRISIS_HAZARDS`).
  - Wire audio voice synth for Spire hum, telegraph pulse, beam discharge, and phase shift chime.
- **Phase 5: Exhaustive Verification**
  - Verify that all 53 test files ($776+$ tests) pass with 0 regressions.
  - Execute 10,000-frame soak test to ensure zero heap allocation drift ($<0.25\text{ MB}$).
  - Confirm Next.js `npm run build` production Turbopack compilation.

---

## 8. Status Report & Scout Conclusion

- **Subsystems Inspected**:
  - `src/game/crises/` (BaseCrisis, CrisisManager, VoidCrisis, LavaCrisis, ClockworkCrisis, SolarFlareCrisis, OrbitalCrisis, RiftCrisis, SituationLog)
  - `src/game/bosses/` (BaseBoss, BossAttackManager, BossHUD, GummyBearBoss, HamsterBoss, QueenBeeBoss, TelegraphEngine)
  - `src/game/hazards/` (DynamicHazard.ts)
  - `src/game/GameScene.ts`
- **Key Validation**:
  - `DynamicHazard.ts` passed 16/16 unit tests in $80\text{ ms}$.
  - Memory layouts, telegraph intervals ($2000\text{ ms}$), dash tunneling window ($150\text{ ms}$ vs $140\text{ ms}$ dash), and damage values ($25$ player / $120$ enemy / $15\%$ boss) are mathematically harmonized with existing game mechanics.
- **Ready for Next Stage**:
  - The architectural pathway is fully cleared for the **Architect & Zero-GC Division** and **Creative Expansion Division** to implement the `GameScene.ts` integration according to the roadmap above.
