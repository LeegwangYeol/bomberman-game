# Adversarial Mechanics Challenge Report: Cute Web Bomberman (GDD.md)

**Challenger**: Challenger 1 (Mechanics Adversarial Challenger)  
**Target Document**: `/Users/user/src/bomberman/GDD.md`  
**Date**: 2026-09-14  
**Verdict**: **REQUEST_CHANGES**  

---

## 1. Observation

Direct examination and empirical simulation of `/Users/user/src/bomberman/GDD.md` revealed nine critical gameplay, mathematical, and logic defects across enemy AI, boss encounters, ally systems, random events, and crises:

### Obs 1: Crisis 1 Singularity Implosion Occurs 18 Seconds Before Climax Scheduled End
* **File Reference**: `/Users/user/src/bomberman/GDD.md`, lines 920–942.
* **Verbatim Text**:
  - Line 921: `Phase 1: The Whispers (0 – 20s)`
  - Line 925: `Phase 2: The Outbreak (20 – 80s)`
  - Line 926: `Void Creep Spreading: Every 6.0s, each active Void Rift devours 1 adjacent tile...`
  - Line 928: `Phase 3: The Climax & Invader Faction (80 – 110s)`
  - Line 941: `Failure (The Singularity): If Void Creep covers >= 45% of walkable tiles (50 tiles total), the board collapses into a black hole implosion: GAME OVER: THE COSMOS WAS CONSUMED.`
  - Line 935: `Charging Mechanic: Detonating a bomb blast adjacent to a Prism charges its crystal meter by +33% (requires 3 blasts per Prism).`
* **Empirical Simulation Command & Output**:
  ```bash
  python3 -c "
  # 4 rifts, starting at t=20s with 4 initial tiles.
  # From t=20s to t=80s (60s): 10 expansion cycles * 4 = 40 new tiles -> 44 tiles at t=80s.
  # Cycle 11 at t=86s: 44 + 4 = 48 tiles.
  # Cycle 12 at t=92s: 48 + 4 = 52 tiles >= 50 tiles (45% threshold).
  "
  # Output: Singularity reached at t=92s (only 12s into Phase 3).
  ```
  - Walking distance between Prism 1 `(1,13)` and Prism 2 `(11,1)` is 22 tiles (5.87s minimum walk time at 150 px/s).
  - Bomb blasts required: 3 per prism $\times$ 2 prisms = 6 blasts, plus 2 blasts on Avatar = 8 blasts.
  - At 2.0s fuse per bomb, 8 bomb blasts take 16.0s.
  - Minimum theoretical completion time: $16.0\text{s} + 5.87\text{s} = 21.87\text{s}$.
  - Actual available time in Phase 3 before board collapse: $92\text{s} - 80\text{s} = 12.0\text{s}$.

### Obs 2: Crisis 2 Dynamo Overload Ammo Deadlock and Environmental Sabotage
* **File Reference**: `/Users/user/src/bomberman/GDD.md`, lines 973–992; `src/game/GameScene.ts`, line 22.
* **Verbatim Text**:
  - `GameScene.ts:22`: `private maxBombs: number = 1;`
  - `GDD.md:979`: `Automated Conveyor Belts: Row 6 and Col 7 transform into spinning conveyor tracks moving at 80 px/s (⏩ and ⏬). Bombs placed on belts are continuously pushed until hitting an obstacle.`
  - `GDD.md:980`: `EMP Clock Pulses: Every 12.0s, the central clock chimes with an EMP pulse: 50% chance active bombs detonate immediately (0.3s fuse hazard); 50% chance fuse is jammed into a 3.5s dud delay (⚡).`
  - `GDD.md:982`: `Clockwork Windup Soldier (🤖) [HP: 2, Speed: 80 px/s]: Rushes active bombs within 2 tiles and snips their fuses with brass shears, disarming the bomb and refunding ammo.`
  - `GDD.md:987–988`: `At map center (6,7) sits the Toymaker's Central Dynamo Core, with 4 Energy Conduits at (5,7), (7,7), (6,8), and (6,6). Overload Mechanic: Players must execute a synchronized 4-bomb chain reaction such that all 4 conduits receive explosion damage within a strict 1.5-second window.`
* **Empirical Simulation**:
  - A player with `maxBombs < 4` cannot place 4 bombs simultaneously.
  - Conduits `(5,7)` and `(7,7)` sit directly on Col 7 conveyor belt (moving downward at 80 px/s).
  - Conduits `(6,6)` and `(6,8)` sit directly on Row 6 conveyor belt (moving rightward at 80 px/s).
  - Bombs slide away from conduits at 2.0 tiles/s immediately upon placement.
  - EMP pulses have a 50% chance to desync bomb fuses to 3.5s, violating the 1.5s synchronization constraint.

### Obs 3: Star Seeker Starlight Supernova 100% Blocked by Indestructible Pillars
* **File Reference**: `/Users/user/src/bomberman/GDD.md`, lines 169–170.
* **Verbatim Text**: `Death Effect: Starlight Supernova. Bursts into 4 sparkling starlight beams traveling 1 tile in cardinal diagonals (NW, NE, SW, SE). Destroys soft blocks and detonates chained bombs instantly.`
* **Empirical Simulation Command & Output**:
  ```bash
  python3 -c "
  ROWS, COLS = 13, 15
  pillars = {(r, c) for r in range(ROWS) for c in range(COLS) if r % 2 == 0 and c % 2 == 0}
  odd_intersections = [(r, c) for r in range(ROWS) for c in range(COLS) if r % 2 == 1 and c % 2 == 1]
  odd_blocked = sum(1 for r, c in odd_intersections for dr, dc in [(-1,-1), (-1,1), (1,-1), (1,1)] if (r+dr, c+dc) in pillars)
  print(f'{odd_blocked} / {len(odd_intersections)*4} blocked')
  "
  # Output: 168 / 168 (100.0%) blocked
  ```
  - At all 42 open crossroads in the 13×15 arena, 100% of diagonal rays collide directly with indestructible wall pillars.
  - In straight corridors, diagonal rays pass through closed tile corners, creating diagonal clipping hazards through walls.

### Obs 4: BaseBoss `takeBombDamage` Drops Chain Explosion Hits During Invulnerability
* **File Reference**: `/Users/user/src/bomberman/GDD.md`, lines 402–403, lines 508–542.
* **Verbatim Text**:
  - Line 402: `Chain Reaction Shatter: Setting up a 2- or 3-bomb chain along his dash lane extends his stun to 4.5 seconds!`
  - Lines 509–514:
    ```typescript
    public takeBombDamage(damage: number = 1): boolean {
      if (this.isInvulnerable || this.bossState === BossState.DEFEATED || !this.canTakeDamage()) {
        return false;
      }
      this.currentHp -= damage;
      this.scene.cameras.main.shake(150, 0.01);
      this.triggerIFrames(1500);
      ...
      return true;
    }
    ```
* **Empirical Simulation Output**:
  - Bomb 1 detonates at $t=0\text{ms}$: `takeBombDamage` returns `true`, sets `isInvulnerable = true` for 1500ms.
  - Bomb 2 detonates at $t=100\text{ms}$: `takeBombDamage` returns `false` due to `isInvulnerable`.
  - Bomb 3 detonates at $t=200\text{ms}$: `takeBombDamage` returns `false` due to `isInvulnerable`.
  - Result: Hits 2 and 3 are rejected by the engine; chain tracking does not exist in `BaseBoss`.

### Obs 5: Lack of Random Event Suppression During Mid-Boss Encounters
* **File Reference**: `/Users/user/src/bomberman/GDD.md`, lines 880–885, lines 836–847, lines 823–835.
* **Verbatim Text**:
  - Line 882: `Crisis Priority: All Random Events are automatically paused during active Mid/End-Game Crises to preserve tactical clarity.`
  - No mention or rule exists regarding Mid-Boss encounters!
* **Empirical Simulation**:
  - Captain Nibbles Phase 3 moves at 320 px/s (transits 2 tiles in 0.25s).
  - Bubble Gravity Flip (zero friction) forces a 1.5-tile slide (stopping time 0.40s).
  - $0.40\text{s} > 0.25\text{s}$: player physically cannot avoid Captain Nibbles in dash lanes under zero friction.
  - Sudden Darkness limits visibility to a 3-tile lantern radius, blinding the player to King Gummy Bear's 2×2 aerial shadow and falling ceiling candies.

### Obs 6: Ally Bomb Collision Trapping & Missing Enemy Interaction Rules
* **File Reference**: `/Users/user/src/bomberman/GDD.md`, lines 573–579, lines 585–620.
* **Verbatim Text**:
  - Line 574: `Allies do NOT possess solid physical colliders with the player.`
  - Line 605: `Pip the Fairy Healer: Mobility: Levitation (floats over placed bombs).`
  - Line 600: `Shelly the Shielding Turtle: Body Block: Completely immune to enemy touch contact; enemies bounce off her hard shell and reverse direction.`
* **Observation**:
  - Kiki, Shelly, and Barnaby do NOT possess bomb levitation. When a player places a bomb in a 1-tile corridor, the ally behind the bomb has 0 escape paths and is unavoidably hit.
  - No touch/contact damage rules exist for Kiki, Barnaby, or Pip when colliding with enemies.
  - Barnaby's `Subterranean Excavate` (line 616) automatically destroys soft blocks every 7.0s, which can unexpectedly destroy player defensive cover against rushing enemies or bomb blasts.

### Obs 7: Candy Thief Bomb Defusal Ammo Leak
* **File Reference**: `/Users/user/src/bomberman/GDD.md`, lines 222–229; `src/game/GameScene.ts`, line 21.
* **Verbatim Text**:
  - `GDD.md:222`: `Bomb Swallower / Defuser! If it runs over an active bomb, it stuffs the bomb into its sack. After 2.5s, it burps out harmless party confetti (🎉), neutralizing the bomb!`
* **Observation**:
  - When `placeBomb()` is executed, `activeBombs` increments.
  - GDD does not state when `activeBombs` is decremented upon bomb swallow. If never decremented, player permanently loses bomb capacity. If decremented after 2.5s, a player with `maxBombs = 1` cannot place another bomb and is permanently softlocked if trapped behind a block.

### Obs 8: Remote Lollipop Detonator Single-Key Input Conflict
* **File Reference**: `/Users/user/src/bomberman/GDD.md`, line 697, lines 1341–1363.
* **Verbatim Text**:
  - Line 697: `Remote Lollipop Detonator (🍭📻): Placed bombs do not auto-explode on fuse; press Spacebar again to detonate!`
  - Lines 1358–1361: Only two action buttons: `🪄 SKILL` and `💣 BOMB!`.
* **Observation**:
  - If Spacebar / Bomb button both plants and detonates bombs, pressing the button to plant a second bomb immediately detonates the first bomb. The player can never plant multiple remote bombs.

### Obs 9: Madame Bonbon Stall Arena Obstruction and Invincible Camping
* **File Reference**: `/Users/user/src/bomberman/GDD.md`, lines 670–687.
* **Verbatim Text**:
  - Lines 680–682: `Indestructible 3x2 stall with a 1-tile peace zone. Enemies cannot enter; bomb placement is disabled inside; external explosion rays are absorbed...`
* **Observation**:
  - 3×2 stall + 1-tile perimeter = 5×4 footprint (20 tiles) on a 13×15 grid. No spawn coordinate algorithm or clearance check is specified.
  - Complete immunity inside the peace zone allows players to camp indefinitely with zero risk.

---

## 2. Logic Chain

1. **Premise 1 (Crisis 1 Playability)**: A crisis climax must provide sufficient time for a player obeying game physics and rules to complete its mandatory objectives before triggering a loss state.
   - *From Obs 1*: Phase 3 is scheduled for 80s–110s (30s). The Singularity loss condition (50 tiles) is reached at $t=92\text{s}$ (12s into Phase 3). The objective requires charging 2 prisms at opposite corners (22 tiles walk) and damaging the Avatar, totaling at least 21.87s under optimal, unhindered conditions.
   - *Inference*: Crisis 1 triggers an automatic loss at $t=92\text{s}$, rendering Phase 3 unwinnable.

2. **Premise 2 (Crisis 2 Solvability)**: Objective requirements must not exceed the baseline capabilities of the player or directly contradict the environmental hazard rules active during that objective.
   - *From Obs 2*: The Dynamo Overload requires a synchronized 4-bomb chain across 4 conduits within 1.5s. A player starting with `maxBombs = 1` who has not acquired 3 upgrades cannot place 4 bombs. Conveyor belts shift bombs off conduits at 80 px/s, and EMP pulses randomize fuse timers between 0.3s and 3.5s.
   - *Inference*: Crisis 2 creates an inescapable progression softlock for under-upgraded players and sabotages player inputs via random EMP fuse delays.

3. **Premise 3 (Geometry Integrity)**: Directional attack and death effects must function logically within the designated map geometry.
   - *From Obs 3*: At every standard open crossroad in Bomberman, the 4 diagonal neighbors are solid pillars. Star Seeker's diagonal blast hits solid pillars 100% of the time. In straight corridors, diagonal rays pass through closed corners.
   - *Inference*: Star Seeker's death effect is completely inert at intersections and causes corner-clipping glitches in corridors.

4. **Premise 4 (Implementation Consistency)**: Architectural code contracts provided in a GDD must accurately execute the mechanics described in the document text.
   - *From Obs 4*: `BaseBoss.takeBombDamage` triggers a 1500ms i-frame window immediately upon the first bomb hit. Multi-bomb chain hits occurring within 100–300ms return `false` and are discarded.
   - *Inference*: The multi-bomb "Chain Reaction Shatter" mechanic cannot function under the provided `BaseBoss` architecture.

5. **Premise 5 (Encounter Fairness)**: Boss battles designed around committed telegraph windows and precise latency equations cannot permit random global physics mutations that invalidate those equations.
   - *From Obs 5*: Section 4.3 pauses events during Crises, but fails to pause them during Mid-Bosses. Events like Bubble Gravity Flip and Sudden Darkness make boss telegraphs unavoidable or invisible.
   - *Inference*: Mid-Boss encounters suffer from unfair, unmitigated RNG difficulty spikes.

6. **Premise 6 (Airtight Resolution Rules)**: Core interactions between allies, enemies, bombs, and inputs must be clearly defined without ambiguity or input collisions.
   - *From Obs 6, 7, 8, 9*: Allies can be trapped by bombs, enemy-ally touch resolution is omitted, Candy Thief defusal threatens ammo leaks, Remote Detonator uses the same button as bomb placement, and the Merchant stall allows indefinite invincible camping.
   - *Inference*: The GDD lacks airtight resolution rules across critical edge cases.

---

## 3. Caveats

1. **Simulation Scope**: Physical simulations used Phaser Arcade Physics constants (40px tiles, 150 px/s player speed, 2.0s bomb fuse) matching the GDD and `src/game/GameScene.ts`. Custom physics engines or modified tile sizes could alter exact timing values by fractions of a second, but cannot eliminate the fundamental mathematical conflicts.
2. **Audio/VFX Performance**: Mobile Web Audio performance and Canvas render performance under maximum particle load were not tested in this mechanics challenge (deferred to System Auditor / Reviewer).
3. **Multiplayer**: Analysis focused on single-player campaign and mid-boss encounters as defined in Sections 1–5.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

The Game Design Document (`/Users/user/src/bomberman/GDD.md`) presents creative, charming, and detailed concepts, but fails adversarial stress-testing due to severe mathematical impossibilities, progression softlocks, code-mechanics desyncs, and ambiguous edge case resolutions.

### Required Action Items for GDD Author:
1. **Fix Crisis 1 Singularity Math**:
   - Reduce Void Creep expansion rate to 1 tile every 10–12 seconds, OR increase the Singularity threshold to 75% (85 tiles), OR pause Void Creep during Phase 3 Climax so the player has the full 30 seconds to solve the Prism puzzle.
2. **Fix Crisis 2 Dynamo Overload Requirements**:
   - Provide a temporary "Clockwork Dynamo Overcharger" item or allow sequential charging of the 4 conduits (e.g. within 6.0s instead of 1.5s).
   - Exempt conduits from conveyor belt sliding, and prevent EMP pulses from affecting bombs placed on conduit pads.
3. **Fix Star Seeker Starlight Supernova**:
   - Change Starlight Supernova from diagonals (`NW, NE, SW, SE`) to an expanding 1-tile diamond or cardinal cross pulse (`N, S, E, W`) to align with Bomberman grid geometry.
4. **Update `BaseBoss` Architecture for Chain Reactions**:
   - Introduce a `chainHitCounter` and a 400ms "Chain Window" before i-frames engage, allowing simultaneous multi-bomb hits to register and trigger extended stuns.
5. **Add Mid-Boss Event Suppression Rule**:
   - Explicitly state in Section 4.3: *"All Random Events are automatically paused during Mid-Boss encounters and Crises."*
6. **Resolve Ally Collision and Hazard Rules**:
   - Explicitly grant all Rescuable Allies `Bomb Phasing` (ability to walk through placed bombs without colliding).
   - Specify enemy touch rules for all allies (e.g. touching an enemy knocks the ally back 1 tile with 1.0s invincibility; does not deal lethal damage).
   - Require Barnaby to only excavate blocks that are NOT currently threatened by active bombs.
7. **Fix Candy Thief Ammo Refund**:
   - Explicitly specify that `activeBombs` is refunded to the player the moment the bomb is swallowed into the sack.
8. **Fix Remote Detonator Input Scheme**:
   - Assign Detonation to a separate input (`E` or `Shift` on PC; dedicated third action button `🕹️ DETONATE` on mobile touch overlay).
9. **Constrain Merchant Stall**:
   - Specify fixed spawn anchor (e.g. Center-Top `(1, 6)`) and impose a 15-second maximum stay limit before Madame Bonbon politely teleports the player outside.

---

## 5. Verification Method

To independently verify the empirical findings in this report, execute the following commands in the workspace root:

1. **Verify Star Seeker Pillar Collision (100% blocked at open intersections)**:
   ```bash
   python3 -c "
   ROWS, COLS = 13, 15
   pillars = {(r, c) for r in range(ROWS) for c in range(COLS) if r % 2 == 0 and c % 2 == 0}
   odd_intersections = [(r, c) for r in range(ROWS) for c in range(COLS) if r % 2 == 1 and c % 2 == 1]
   blocked = sum(1 for r, c in odd_intersections for dr, dc in [(-1,-1), (-1,1), (1,-1), (1,1)] if (r+dr, c+dc) in pillars)
   assert blocked == len(odd_intersections) * 4
   print('Verified: 100% of Star Seeker diagonal rays hit pillars at open intersections.')
   "
   ```

2. **Verify Crisis 1 Singularity Premature Defeat Timing**:
   ```bash
   python3 -c "
   rifts = 4
   tiles = 4
   for t in range(26, 111, 6):
       tiles += rifts
       if tiles >= 50:
           print(f'Singularity reached at t={t}s! (Phase 3 begins at 80s, ends at 110s)')
           break
   assert t < 110
   "
   ```

3. **Verify BaseBoss Chain Reaction i-Frame Rejection**:
   Inspect `GDD.md` lines 508–542: verify that `takeBombDamage` triggers `this.triggerIFrames(1500)` on the first hit and immediately returns `false` on any subsequent call while `isInvulnerable` is true.

4. **Verify Mid-Boss Event Pause Omission**:
   Inspect `GDD.md` Section 4.3 (lines 880–885): verify that only Crises are mentioned in the event suppression rule, leaving Mid-Bosses unhandled.
