# Specialized NPCs and Ally Systems Design Specification & Handoff Report

## Executive Summary
This document delivers the comprehensive game design and technical architecture for **Specialized NPCs and Ally Systems** in the Cute Web Bomberman game. The system transforms the traditionally solitary, high-stress Bomberman grid into a lively, cooperative, and delightfully cute adventure. The core pillars designed herein include:
1. **Rescuable Allies**: 4 distinct characters (Bomb-Kicking Kitty, Shielding Turtle, Fairy Healer, Miner Mole) with full AI Finite State Machines, intelligent leash-following, priority explosion-evasion, and safety grace periods to prevent accidental rescue fatalities.
2. **Companion Pets System**: 3 unique starter/unlockable pets (Shiba Inu, Fluffy Bunny, Baby Dragon) featuring active mood decay/feeding loops, treat boosts, and passive navigation perks.
3. **Wandering Fairy Merchants**: Safe-zone stall generation, an integrated candy currency economy, a 10-item shop inventory, dynamic dialogue bubbles, and anti-blast sanctuary barriers.
4. **Helper Spirits & Environmental NPCs**: Slumbering Ancient Candy Trees (with gentle-blast wake mechanics), Friendly Map Ghosts (secret spotters and emergency bomb movers), and Wandering Cheerleaders (combo-boosting pixies).
5. **Technical Architecture**: Pure Canvas 2D and Unicode emoji rendering pipelines, zero-asset Web Audio synthesis scripts, and TypeScript contract interfaces ready for engine integration.

---

## 1. Observation

Direct code and architectural observations from the current repository:

1. **Grid & Physics Parameters**:
   - `src/game/GameScene.ts:3-5`: The playfield is defined as `TILE_SIZE = 40`, `ROWS = 13`, `COLS = 15`.
   - `src/game/GameScene.ts:7-9`: Tile types are integers: `TILE_EMPTY = 0`, `TILE_WALL = 1`, `TILE_BLOCK = 2`.
   - `src/game/GameScene.ts:189`: Player speed is `150 px/s` (3.75 tiles per second).
   - `src/game/GameScene.ts:211`: Current enemy movement is `60 px/s` (1.5 tiles per second).
   - `src/game/GameScene.ts:260-262`: Bomb placement sets a `2000ms` delayed call to `explodeBomb(bomb, row, col)`.
   - `src/game/GameScene.ts:278-297`: Bomb explosion propagates along 4 cardinal directions up to `bombPower` tiles, blocked by `TILE_WALL` and breaking `TILE_BLOCK`.
   - `src/game/GameScene.ts:307-314`: Explosions trigger instant one-hit death on both player (`playerDie()`) and enemies (`enemyHit.destroy()`) via Arcade physics overlap.

2. **Entity & Collision Mechanics**:
   - `src/game/GameScene.ts:103-110`: Physical colliders are established between `(player, walls)`, `(player, blocks)`, `(player, bombs)`, and `(enemies, ...)`.
   - Critical AI pitfall observed: If ally NPCs were given standard solid colliders (`physics.add.collider(player, ally)`), allies would physically pin the player into narrow 1-tile corridors or dead ends, causing catastrophic unavoidable player deaths when bombs are placed.
   - `src/game/GameScene.ts:31-74`: Textures are created procedurally via `Phaser.GameObjects.Graphics` with simple flat geometric primitives (circles and squares), confirming that the game currently uses zero external sprite sheet assets.

3. **Requirements & Scope**:
   - `ORIGINAL_REQUEST.md:16`: Requires "Specialized NPCs and Ally systems" in the Game Design Document.
   - `ORIGINAL_REQUEST.md:20-21`: Propose UI/UX improvements using "pure CSS, HTML Canvas, and emojis to make the game look exceptionally cute and polished, without requiring external image assets."
   - `.agents/orchestrator/PROJECT.md:5-6`: "Theme: Cute, pastel, bubbly, candy/fluffy aesthetic with high tactical Bomberman depth."
   - `.agents/explorer_allies/DISPATCH.md:9-30`: Details the four mandatory subsystems: Rescuable Allies, Companion Pets, Wandering Fairy Merchants, and Helper Spirits & Environmental NPCs.

---

## 2. Logic Chain

1. **Observation Ref (GameScene.ts:103-110 & 260-298)**:
   - In traditional Bomberman, narrow 1-tile corridors mean any entity occupying a tile can block escape paths.
   - *Deduction*: Ally NPCs and Companion Pets MUST NOT possess hard physical collision with the player. They must utilize **soft-separation overlap physics** (passing through the player with gentle visual separation vectors) so they never trap the player in a dead end.

2. **Observation Ref (GameScene.ts:260-298 & 307-310)**:
   - In standard bomb mechanics, a blast wave destroys a block and continues through empty space or terminates at the block tile. If a cage is broken by a blast, the blast ray would naturally hit the newly freed ally on the exact same frame or sub-frame.
   - *Deduction*: Rescuable cages require a **"Rescue Grace Invulnerability Shield"** (1.5 seconds of invincibility with rainbow bubble visuals) and the cage itself must act as a blast terminator for that initial explosion ray.

3. **Observation Ref (GameScene.ts:189 & 211 - Player speed = 150 px/s)**:
   - Ally movement speed must be dynamically tuned to avoid lagging behind or overshooting the player.
   - *Deduction*: Leash following uses an elastic speed model:
     - Close proximity (distance < 1.5 tiles): Ally slows to match player or idles.
     - Medium range (1.5 to 4 tiles): Standard follow speed (140-160 px/s).
     - Leash break (distance > 5 tiles): Ally enters "Catch-up Sprint" (220 px/s) or cute teleport burrow after 3 seconds of blockage.

4. **Observation Ref (ORIGINAL_REQUEST.md:20-21 & GameScene.ts:31-74 - Zero Asset Constraint)**:
   - All visual elements must be rendered using pure HTML5 Canvas drawing routines, CSS, and Unicode emojis with procedural transforms.
   - *Deduction*: Every NPC, pet, cage, and merchant stall is defined with exact Canvas drawing code, emoji anchors (🐱, 🐢, 🧚, 🐹, 🐕, 🐇, 🐲, 🎪), squash-and-stretch sine parameters, and Web Audio API tone synthesis.

5. **Observation Ref (PROJECT.md:5 & Candy/Pastel Aesthetic)**:
   - A cohesive economy is needed to link exploration, combat, merchant purchasing, and pet feeding.
   - *Deduction*: A universal **Candy Currency (🍬)** dropped from soft blocks (30% rate) and defeated enemies (2-3 candies) creates an engaging loop: destroy blocks -> collect candy -> feed pet for buffs OR spend at Fairy Merchant for tactical upgrades.

---

## 3. Subsystem 1: Rescuable Allies

### 3.1 Cage & Imprisonment Mechanics
Allies are discovered throughout stages trapped in specialized containers embedded within the grid layout.

| Container Type | Durability | Spawn Rate | Visual Representation | Rescue Rule & Behavior |
|---|---|---|---|---|
| **Sugar-Coated Cage** | 1 Blast | 65% of rescue spawns | Pastel pink candy-cane bars with golden padlock emoji 🔒 | 1 bomb blast shatters cage into sweet sugar shards. Ally emerges with 1.5s bubble shield. |
| **Amber Jelly Crystal** | 2 Blasts | 35% of rescue spawns | Translucent amber gelatin block with trapped ally silhouette inside | Takes 1 blast to crack (wobbles violently), second blast frees ally. Absorbs blast energy. |

#### The "Safe-Rescue Protocol" (Anti-Frustration Mechanic)
A frequent flaw in grid-bomb games is when the blast that frees an ally immediately incinerates them. We establish the **Safe-Rescue Protocol**:
1. **Ray Absorption**: The cage tile acts as a blast-stopping obstacle (`TILE_WALL` behavior for the triggering explosion), terminating the blast ray at the cage's perimeter.
2. **Rescue Grace Period**: Upon the cage reaching 0 HP, the freed ally is immediately wrapped in a **Sugar Bubble Shield (🫧)** for **1500 ms**.
   - Immune to all explosion waves and enemy collision damage.
   - Ally executes an automatic **"Evasive Leap"** (2 tiles perpendicular to the blast vector).
   - A cheerful audio chime plays (`C5 -> E5 -> G5 -> C6` arpeggio) and a speech bubble displays: *"Thank you! Let's go! 💖"*.
3. **Stage Retention**: Rescued allies stay with the player until the end of the current World or until they faint. If an ally takes lethal damage, they enter a **"Dizzy Stars" (💫)** state for 12 seconds rather than permanent death, reviving with 1 HP.

---

### 3.2 Distinct Rescuable Ally Roster

#### 1. Kiki the Bomb-Kicking Kitty 🐱
* **Aesthetic**: Orange calico kitten wearing a crimson hero bandana, white marshmallow paws, and a flicking tail.
* **Canvas Emoji & Styling**: Emoji `🐱` / `🐾`. Ambient sine-wave ear twitch and bouncy walk cycle.
* **Role**: Tactical Offensive Disruption & Bomb Redirection.
* **Base Stats**:
  - HP: 1 Hit (Revives after 12s sleep state).
  - Move Speed: `175 px/s` (1.17x player speed, highly agile).
  - Leash Radius: Min 1.5 tiles, Max 3.0 tiles.
* **Unique Abilities**:
  - **Paw Kick (🐾)**: If an active bomb is in Kiki's direct line of sight and within 2 tiles, and either (a) an enemy is aligned in the opposite direction, or (b) the bomb threatens the player's safety, Kiki sprints to the bomb and kicks it forward. The bomb slides at `320 px/s` until colliding with a wall, block, or enemy. Cooldown: 3.5 seconds.
  - **Pounce Reflex**: When an enemy approaches within 1 tile, Kiki performs a backflip leap 1 tile away, avoiding contact.
* **AI Cooperative Logic**: Kiki never kicks a bomb toward the player. Kiki calculates the trajectory before kicking; if the player's current tile or planned retreat tile lies in the kick line, the kick action is aborted.

```
+---+---+---+---+---+
| 🐱| 💣| . | . | 👾|  --> Kiki kicks 💣 towards enemy 👾!
+---+---+---+---+---+
```

#### 2. Shelly the Shielding Turtle 🐢
* **Aesthetic**: Mint-green baby turtle with a carved strawberry shell, rosy cheeks, and slow, determined blinks.
* **Canvas Emoji & Styling**: Emoji `🐢` / `🍓`. Green-tinted hex particle aura when shield is ready.
* **Role**: Defensive Guardian & Emergency Blast Interceptor.
* **Base Stats**:
  - HP: 2 Hits (At 1 HP, shell shows hairline cracks with band-aid emoji 🩹).
  - Move Speed: `110 px/s` (0.73x player speed, deliberate and sturdy).
  - Leash Radius: Min 0.8 tiles, Max 2.0 tiles (hugs the player closely).
* **Unique Abilities**:
  - **Dome Shell Shield (🛡️)**: When the player is trapped inside a blast crosshair with fuse `<= 0.6s` and `0` legal escape paths, Shelly activates an instantaneous 1x1 dome shield over the player's tile or positions herself directly between the blast epicenter and the player. The dome absorbs 1 full explosion wave. Cooldown: 16 seconds.
  - **Body Block**: Shelly is completely immune to enemy touch contact (enemies bounce off her hard shell with a soft thud and reverse direction).
* **AI Cooperative Logic**: Always moves to stay between the player and the nearest detected enemy.

#### 3. Pip the Fairy Healer 🧚
* **Aesthetic**: Lilac and sky-blue glowing sprite with fluttering translucent wings, trailing pastel stardust.
* **Canvas Emoji & Styling**: Emoji `🧚` / `✨`. Floats smoothly 6px above the floor; continuous star particle emitter.
* **Role**: Sustain, Revives, and Blast Path Telegraphing.
* **Base Stats**:
  - HP: 1 Hit (Disperses into fairy dust; reforms next to player after 15s).
  - Move Speed: `150 px/s` (Matching player speed).
  - Mobility: **Levitation** — Can float over active bombs on the floor without triggering collision or blocking paths.
* **Unique Abilities**:
  - **Stardust Beacon (✨)**: Passively highlights dangerous explosion zones on the Canvas in translucent strawberry red (`rgba(255, 99, 132, 0.35)`) and marks the optimal safe retreat tile with a pulsating mint-green star ring (`rgba(75, 192, 192, 0.6)`).
  - **Guardian Miracle (💖)**: If the player suffers lethal damage while Pip is active, Pip sacrifices her current physical form in a brilliant burst of rainbow glitter. The player is granted instant revival, 3.0 seconds of invincibility, and +1 Heart.
  - **Sweet Harvest**: Boosts all candy drops from soft blocks by +50%.

#### 4. Barnaby the Miner Mole 🐹
* **Aesthetic**: Plump mocha-colored mole wearing oversized brass goggles and carrying a miniature silver spade.
* **Canvas Emoji & Styling**: Emoji `🐹` / `⛏️`. Dirt puff particle emitter when moving.
* **Role**: Rapid Terrain Excavation & Secret Unearthing.
* **Base Stats**:
  - HP: 1 Hit.
  - Move Speed: `130 px/s`.
  - Leash Radius: Min 2.0 tiles, Max 4.0 tiles.
* **Unique Abilities**:
  - **Subterranean Excavate (⛏️)**: Every 7 seconds, Barnaby targets an adjacent breakable block (`TILE_BLOCK`). He burrows underground (invulnerable for 1.0s), pops up under the block, and dismantles it instantly without detonating a bomb! Guarantees 1 Candy drop and 25% chance of a powerup.
  - **Secret Dowsing (💎)**: Soft blocks containing the stage exit door or hidden merchant keys emit small golden question mark particles `❓` visible through the fog of war.
  - **Escape Tunnel**: If cornered by an explosion, Barnaby can dig underground for 2.0s, completely avoiding damage.

---

### 3.3 AI Companion Finite State Machine (FSM)

Allies utilize a 5-tier hierarchical behavioral architecture to guarantee player assistance without nuisance or accidental obstruction.

```
                    +-------------------+
                    |  EVADE_EXPLOSION  | (Priority 1: Life Safety)
                    +---------^---------+
                              | Hazard Detected (Fuse < 1.2s)
                    +---------+---------+
                    | DEFENSIVE_SUPPORT | (Priority 2: Shield/Kick Bomb)
                    +---------^---------+
                              | Teammate in Peril
                    +---------+---------+
                    |   FOLLOW_LEASH    | (Priority 3: Maintain Formation)
                    +---------^---------+
                              | Distance > LeashMax
                    +---------+---------+
                    | COOPERATIVE_SKILL | (Priority 4: Dig/Heal/Scout)
                    +---------^---------+
                              | Ability Ready & Safe
                    +---------+---------+
                    |    IDLE_CUTE      | (Priority 5: Playful Emotes)
                    +-------------------+
```

#### Hazard Map & Evasion Algorithm
At every tick (60 Hz), allies evaluate a dynamic **Hazard Grid**:
```typescript
interface HazardTile {
  row: number;
  col: number;
  threatLevel: number; // 0 = safe, 1-100 = imminent explosion
  timeToDetonation: number;
}

function calculateHazardMap(scene: GameScene): number[][] {
  const hazard: number[][] = Array(ROWS).fill(0).map(() => Array(COLS).fill(0));
  
  scene.bombs.getChildren().forEach((b: any) => {
    const br = Math.floor(b.y / TILE_SIZE);
    const bc = Math.floor(b.x / TILE_SIZE);
    const timeLeft = b.getData('fuseTimer') || 2000;
    const power = scene.bombPower;
    
    // Mark epicenter
    hazard[br][bc] = Math.max(hazard[br][bc], 100);
    
    // Raycast in 4 cardinal directions
    const dirs = [{dr: -1, dc: 0}, {dr: 1, dc: 0}, {dr: 0, dc: -1}, {dr: 0, dc: 1}];
    for (const d of dirs) {
      for (let i = 1; i <= power; i++) {
        const nr = br + d.dr * i;
        const nc = bc + d.dc * i;
        if (scene.map[nr][nc] === TILE_WALL || scene.map[nr][nc] === TILE_BLOCK) break;
        hazard[nr][nc] = Math.max(hazard[nr][nc], Math.floor((2000 - timeLeft) / 20));
      }
    }
  });
  return hazard;
}
```

* **Evasion Behavior**:
  If the ally's current tile has `hazard > 0`:
  1. Perform breadth-first search (BFS) up to radius 4 to locate nearest tile where `hazard == 0` and `map[r][c] == TILE_EMPTY`.
  2. Set ally velocity directly along the shortest safe path at maximum evasive sprint speed (`180 px/s`).
  3. Cancel all offensive/excavation abilities until `hazard == 0`.

---

## 4. Subsystem 2: Companion Pets System

Companion pets are non-combat loyal critters chosen prior to entering a dungeon or unlocked through world progression. Unlike Rescuable Allies, Pets are small, immortal, floating/following companions that provide passive utility and mood-driven active boosts.

### 4.1 The Three Core Companion Pets

```
       Mochi (🐕 Shiba Inu)             Fluff (🐇 Angora Bunny)          Puff (🐲 Baby Dragon)
   [Danger Bark & Sniff Out]          [Candy Magnet & Bunny Hop]       [Ember Spit & Rainbow Blast]
```

#### 1. Mochi the Shiba Inu 🐕
* **Personality**: Hyper-vigilant, proud, loves roasted sweet potatoes and ear scritches.
* **Visual Styling**: Curled cinnamon tail that wags at 6 Hz, pointy black-tipped ears, red collar with gold bell.
* **Passive 1: Danger Bark (🔊⚠️)**:
  - When any bomb in the active stage has a fuse timer `<= 0.9s` AND the player's current tile is in the blast line, Mochi emits an energetic bark sound effect, displays a cartoon speech bubble `⚠️ WOOF!`, and projects a pulsing directional arrow pointing toward the nearest hazard-free tile.
* **Passive 2: Sniff Out (👃✨)**:
  - Detects hidden exit doors and secret item blocks within a 5-tile radius. A cute floating paw print `🐾` hovers and bounces above the identified block.
* **Active Treat Boost: "Zoomies!" (⚡💨)**:
  - Triggered by feeding 3 Candies.
  - Duration: 6.0 seconds.
  - Effect: Player and Pet gain +30% movement speed, immunity to floor hazards (ice/honey slows), and the ability to phase directly through placed bombs.

#### 2. Fluff the Angora Bunny 🐇
* **Personality**: Insatiable sweet tooth, cuddly, round as a cotton ball.
* **Visual Styling**: Oversized floppy ears that flutter during movement, pastel pink nose that twitches continuously.
* **Passive 1: Candy Vacuum (🍬🧲)**:
  - Automatically draws in all dropped Candies, Star Shards, and Fruit within a **2-tile Chebyshev radius**, pulling them directly into the player's inventory without requiring direct pickup navigation.
* **Passive 2: Lucky Clover (🍀)**:
  - Defeated enemies have a 100% chance to drop +1 bonus Candy.
  - Soft blocks have a +15% chance to yield an extra powerup or heart item.
* **Active Treat Boost: "Bunny Hop" (🦘✨)**:
  - Triggered by feeding 3 Candies.
  - Duration: 8.0 seconds.
  - Effect: Double-tapping any movement direction key allows the player to perform an agile hop over 1 obstacle (bomb, breakable block, or low wall gap) with a cute `*boing!*` sound effect. Cooldown: 1.5s between hops.

#### 3. Puff the Baby Marshmallow Dragon 🐲
* **Personality**: Warm, sleepy, breathes harmless cotton-candy scented embers.
* **Visual Styling**: Pastel lavender scales, mint-green stubby wings, tiny gold horns, leaves faint smoke rings.
* **Passive 1: Ember Spit (🔥🍬)**:
  - Every 5.0 seconds, Puff spits a tiny pastel ember at the nearest enemy within 3 tiles. The ember deals no damage but coats the enemy in sticky sugar glaze, reducing their movement speed by **35% for 3 seconds**.
* **Passive 2: Rainbow Confection Blast (🌈💣)**:
  - Every 4th bomb deployed by the player is infused with Dragon Sugar: its explosion radius is expanded by **+1 tile in all directions** and renders with a sparkling pastel rainbow shockwave.
* **Active Treat Boost: "Sugar Flambé" (🍢🔥)**:
  - Triggered by feeding 3 Candies.
  - Effect: Puff exhales a joyful swirl of sugar fire that instantly caramelizes and incinerates **up to 2 adjacent breakable blocks**, converting them directly into 2-4 guaranteed consumable candies without risk of explosion damage.

---

### 4.2 Pet Mood & Feeding Loop

To make pets feel alive and foster emotional bonding, each pet has a dynamic **Mood Meter** that governs their passive effectiveness.

```
       0%                       40%                       80%               100%
  [  Hungry 🥺  ]   ---->   [  Happy 😊  ]   ---->   [ Overjoyed 🥳 ]   [ Super Star ⭐ ]
   Passives Halved           Normal Passives          Passives +50%      Shop Discount 20%
```

#### Mood Dynamics Specification
1. **Capacity & Decay**:
   - Mood scale: `0` to `100` points.
   - Natural decay: `-1 point every 3.0 seconds` (loses 20 points per minute).
   - Combat distress: If the player takes damage, pet loses `5 mood points` from fright.
2. **Feeding Mechanics**:
   - Player can feed their pet anytime by pressing the **Treat Button** (`F` key on PC, or the dedicated snack icon on touch screens).
   - Feed Cost: **3 Candies (🍬)** per snack.
   - Feeding Reward:
     - Instantly restores `+40 Mood Points`.
     - Triggers the Pet's specific **Active Treat Boost** for 6-8 seconds.
     - Spawns a floating pink heart emoji `💖` with a satisfied purr/squeak sound.
3. **Mood Tier Perks**:
   - **Overjoyed Tier (80 - 100%)**:
     - All passive ranges and frequencies boosted by **+50%** (e.g., Fluff's vacuum expands to 3 tiles; Mochi's sniff radius expands to 7 tiles).
     - Grants a **20% "Cute Companion Discount"** at all Wandering Fairy Merchant stalls.
   - **Happy Tier (40 - 79%)**:
     - Standard baseline passive performance.
   - **Hungry / Sulking Tier (0 - 39%)**:
     - The pet moves sluggishly, stops emitting positive auras, and displays tearful eyes `🥺`. Passives operate at 50% frequency.

---

## 5. Subsystem 3: Wandering Fairy Merchants

The Fairy Merchant adds strategic resource allocation, roguelite depth, and charming narrative interludes between intense bombing stages.

### 5.1 Madame Bonbon & The Safe-Zone Stall

```
                    +-----+-----+-----+
         Awning:    | 🎪  | 🍬  | 🧁  |  <-- Striped Pastel Canopy
                    +-----+-----+-----+
         Counter:   | 🧚‍♀️ | 🛍️  | ⭐  |  <-- Madame Bonbon & Goods
                    +-----+-----+-----+
         Sanctuary: | .   | .   | .   |  <-- Anti-Monster Safe Perimeter
                    +-----+-----+-----+
```

#### Spawning Logic
- **Spawn Schedule**: Guaranteed to appear in stages ending in **3** and **7** (e.g., Stage 1-3, 1-7, 2-3, 2-7, 3-3, 3-7).
- **Placement**: Generates in an excavated 3x2 alcove or near the center of the stage. The stall replaces 6 tile positions with indestructible pastel awning counters.
- **Sanctuary Barrier (Holy Sugar Shield)**:
  - The 1-tile perimeter around the stall is an enchanted **Peace Zone**.
  - Enemies cannot enter the sanctuary (their pathfinding treats the perimeter as an impassable barrier).
  - Bomb placement is disabled within 1 tile of the stall.
  - If a stray explosion ray from outside touches the stall perimeter, it is instantly absorbed with a sparkling `*ting!*` sound and a pastel bubble message: `"No loud bangs near the merchandise, darling! 🎀"`.

---

### 5.2 Candy Currency Economy

The game's micro-economy balances drop rates against item power curves:

| Source | Drop Rate | Quantity | Notes |
|---|---|---|---|
| Breakable Block (`TILE_BLOCK`) | 30% | 1 Candy (🍬) | Boosted to 45% by Pip or Fluff |
| Normal Enemy Defeat | 100% | 2 - 3 Candies | Multi-kills add +1 combo candy |
| Mid-Boss Defeat | 100% | 15 - 20 Candies | Erupts in a celebratory candy shower |
| Slumbering Tree Awakening | 100% | 3 - 5 Candies | Yields high-value Star Candies |

An average stage yields **14 to 22 Candies**, ensuring players can purchase 1-2 upgrades per merchant visit or invest in pet feeding snacks.

---

### 5.3 Complete Merchant Inventory & Pricing Table

Madame Bonbon presents a randomized selection of 4 items per appearance chosen from the following 10 master wares:

| # | Item Name | Icon | Price (🍬) | Category | Mechanical Effect & Duration |
|---|---|---|---|---|---|
| 1 | **Sugar Bomb Core** | 💣✨ | 18 | Stat Upgrade | Increases Maximum Placed Bombs by **+1** (Permanent for run). |
| 2 | **Caramel Range Booster** | 🍮🔥 | 14 | Stat Upgrade | Increases Bomb Blast Radius by **+1 Tile** (Permanent for run). |
| 3 | **Gummy Sprint Boots** | 🥾🍬 | 12 | Stat Upgrade | Increases Player Move Speed by **+15 px/s** (Caps at 220 px/s). |
| 4 | **Bubblegum Shield** | 🫧🛡️ | 16 | Consumable | Automatically absorbs 1 fatal explosion or enemy hit; shatters into sugary mist granting 2.5s invincibility. |
| 5 | **Kick-Slippers** | 🩰💥 | 12 | Mechanic | Grants ability to kick stationary bombs forward by walking into them. |
| 6 | **Remote Lollipop Detonator** | 🍭📻 | 24 | Game-Changer | Placed bombs do not auto-explode on fuse; press Spacebar again to detonate on command! |
| 7 | **Mystery Macaron Box** | 🎁🧁 | 8 | Gamble | Random roll: 40% Rare Upgrade, 30% Candy Jackpot (+25 🍬), 20% +1 Max Heart, 10% Joke Confetti Popper. |
| 8 | **Gourmet Pet Truffle** | 🍫⭐ | 6 | Pet Boost | Immediately sets Pet Mood to 100% and triggers 20 seconds of Super-Overjoy state. |
| 9 | **Fairy Whistle** | 🪈🧚 | 15 | Ally Summon | Summons a random Rescuable Ally instantly to the player's side if solo. |
| 10 | **Starlight Sparkle Trail** | ✨🌈 | 4 | Cosmetic | Gives player footsteps an iridescent rainbow star trail and delicate chime sounds for the world. |

---

### 5.4 Dynamic Dialogue & Interaction Bubbles
Madame Bonbon speaks through animated CSS speech bubbles floating above her stall:
- **Greeting**: `"Welcome to the Sweet Spot! Everything is fresh and blast-proof! 🧁"`
- **Pet Compliment (High Mood)**: `"Oh my stars, what an adorable pet! Take 20% off anything on the shelf, sweetie! 💕"`
- **Player at 1 HP**: `"Ooh, you're looking a bit crumbly! Better grab a Bubblegum Shield before moving on! 🩹"`
- **Insufficient Funds**: `"Sorry honey, quality sugar isn't free! Go smash some more jelly blocks! 🍬"`
- **After Purchase**: `"A delightful choice! May your fuses burn bright and your sugar stay sweet! ✨"`

---

## 6. Subsystem 4: Helper Spirits & Environmental NPCs

To make the stage environment feel organic and reactive, specialized non-hostile entities occupy fixed points or roam corridor perimeters.

```
       🌳 Slumbering Candy Tree              👻 Friendly Map Ghost            🎀 Wandering Cheerleader
   [Wake with Gentle Tip of Blast]         [Guides to Exit & Pushes Bombs]     [Aura Buffs & High-Fives]
```

### 6.1 Slumbering Ancient Candy Trees 🌳🧁
Ancient confectionary willows planted in select dead-end alcoves of the maze.
- **Initial State**: Deep slumber. Animated `Zzz` bubble emojis rise smoothly from the crown at 1.5-second intervals.
- **Awakening Mechanic: "The Gentle Breeze Rule"**:
  - The tree is sensitive to blast force.
  - **Gentle Blast (Success)**: If the tree is brushed by the outer tip of an explosion wave (distance `>= 2 tiles` from bomb epicenter), the tree wakes up smiling: `(◕‿◕)♪`. It shakes its candy-cane branches, showering **3 Star Candies** or an **Extra Life Heart (💖)** onto adjacent open tiles! It then remains happily awake, waving leaves as the player walks by.
  - **Point-Blank Blast (Failure)**: If a bomb detonates directly adjacent to the tree (distance `== 1 tile`), the intense heat singes its caramel bark. The tree wakes up coughing and angry `(╬ Ò﹏Ó)`, flings 2 harmless stinging chestnuts that push the player back 1 tile, and permanently petrifies into a solid charred stump that yields nothing.

---

### 6.2 Friendly Map Ghosts 👻🕯️
Translucent, adorable pastel-violet specters floating effortlessly through walls and soft blocks.
- **Nature**: Playful, non-aggressive poltergeists who love helping visitors navigate the sugar maze.
- **Special Behaviors**:
  1. **Secret Spotting**: The ghost drifts slowly through the maze toward the hidden stage exit door. Upon finding it, the ghost hovers in place, holds up a tiny lit candle `🕯️`, and points downward with a cute giggling sound effect, revealing the exit location through unbroken blocks.
  2. **Ghostly Phase-Push**: If the player accidentally traps themselves in a 1-tile dead end with a ticking bomb, the ghost swoops in, gently phases through the bomb, and pushes it 1 tile away into an open corridor, saving the player's life with a wink `(^_−)☆`! Cooldown: Once per stage.

---

### 6.3 Wandering Cheerleaders 🎀📣
Miniature pixie duos with pastel pom-poms patrolling cleared main corridors.
- **Celebration Trigger**:
  - Whenever the player destroys 3 or more blocks in a single blast or eliminates an enemy, the cheerleaders jump into the air with synchronized twirls: `"GO GO BOMBER! YAY! 🎉"`.
- **Aura Buff: "Sugar Rush Cheer"**:
  - While the player is within a **2-tile radius** of a cheerleader:
    - Player movement speed is boosted by **+12%**.
    - Placed bomb fuses burn **25% faster** (detonating in `1.5s` instead of `2.0s`), enabling rapid-fire tactical blitzing.
- **High-Five Interaction**:
  - Running directly through a cheerleader triggers a cheerful high-five slap sound `*clap!*`, spawns floating music notes `🎵`, and awards **+1 bonus Candy**.

---

## 7. Technical Implementation Blueprint

### 7.1 TypeScript Contract Interfaces

```typescript
// ==========================================
// Specialized NPCs and Ally Systems Types
// ==========================================

export enum AllyType {
  KITTY_BOMB_KICKER = 'KITTY_BOMB_KICKER',
  TURTLE_SHIELDER = 'TURTLE_SHIELDER',
  FAIRY_HEALER = 'FAIRY_HEALER',
  MOLE_MINER = 'MOLE_MINER'
}

export enum AllyState {
  IDLE = 'IDLE',
  FOLLOW = 'FOLLOW',
  EVADE = 'EVADE',
  ABILITY = 'ABILITY',
  FAINTED = 'FAINTED'
}

export interface IAllyEntity {
  id: string;
  type: AllyType;
  emoji: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  state: AllyState;
  leashMinDistance: number;
  leashMaxDistance: number;
  abilityCooldown: number;
  currentCooldown: number;
  isInvulnerable: boolean;
  invulnerabilityTimer: number;
  
  update(dt: number, scene: any): void;
  performAbility(scene: any): boolean;
  takeDamage(amount: number): void;
  render(ctx: CanvasRenderingContext2D): void;
}

export enum PetType {
  SHIBA_MOCHI = 'SHIBA_MOCHI',
  BUNNY_FLUFF = 'BUNNY_FLUFF',
  DRAGON_PUFF = 'DRAGON_PUFF'
}

export interface ICompanionPet {
  type: PetType;
  emoji: string;
  name: string;
  mood: number; // 0 to 100
  boostTimer: number; // Active treat boost remaining (seconds)
  x: number;
  y: number;
  
  feedTreat(): boolean;
  update(dt: number, scene: any): void;
  render(ctx: CanvasRenderingContext2D): void;
}

export interface IShopItem {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  description: string;
  category: 'STAT' | 'CONSUMABLE' | 'MECHANIC' | 'COSMETIC';
  onPurchase: (player: any, scene: any) => void;
}
```

---

### 7.2 Pure Canvas 2D Procedural Rendering Specifications

To fulfill the zero-external-asset constraint, all allies, pets, cages, and stalls are rendered procedurally via Canvas 2D contexts with emoji compositing, dynamic shadows, and sine-wave deformations.

#### 1. Procedural Ally Rendering (Squash & Stretch + Shadow)
```typescript
export function renderCuteAlly(
  ctx: CanvasRenderingContext2D,
  ally: IAllyEntity,
  time: number
) {
  ctx.save();
  ctx.translate(ally.x, ally.y);

  // 1. Soft Oval Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.beginPath();
  ctx.ellipse(0, 14, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Squash and Stretch Walk Cycle
  const bounce = Math.sin(time * 0.01 * (ally.speed / 20));
  const scaleX = 1 - bounce * 0.08;
  const scaleY = 1 + bounce * 0.08;
  ctx.scale(scaleX, scaleY);

  // 3. Invulnerability Bubble Glow
  if (ally.isInvulnerable) {
    ctx.strokeStyle = `rgba(255, 182, 193, ${0.6 + 0.4 * Math.sin(time * 0.02)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 4. Emoji Character Sprite
  ctx.font = '26px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ally.emoji, 0, -2);

  // 5. Dizzy Stars if Fainted
  if (ally.state === AllyState.FAINTED) {
    const starAngle = (time * 0.005) % (Math.PI * 2);
    const starX = Math.cos(starAngle) * 14;
    const starY = -18 + Math.sin(starAngle) * 5;
    ctx.font = '12px sans-serif';
    ctx.fillText('💫', starX, starY);
  }

  ctx.restore();
}
```

#### 2. Procedural Sugar Cage Rendering
```typescript
export function renderSugarCage(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tileSize: number,
  isDamaged: boolean
) {
  ctx.save();
  ctx.translate(x, y);

  // 1. Translucent Sugar Tint
  ctx.fillStyle = isDamaged ? 'rgba(255, 200, 220, 0.4)' : 'rgba(255, 230, 240, 0.6)';
  ctx.fillRect(0, 0, tileSize, tileSize);

  // 2. Candy-Cane Striped Vertical Bars
  const barWidth = 4;
  const barCount = 4;
  const spacing = tileSize / (barCount + 1);

  for (let i = 1; i <= barCount; i++) {
    const barX = i * spacing;
    ctx.fillStyle = i % 2 === 0 ? '#FF6B8B' : '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(barX - barWidth / 2, 2, barWidth, tileSize - 4, 2);
    ctx.fill();
  }

  // 3. Golden Heart-Padlock
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔒', tileSize / 2, tileSize / 2);

  ctx.restore();
}
```

---

### 7.3 Web Audio API Synthetic Sound Effects (Zero External Audio)

Using standard Web Audio synth tones, the ally interactions emit charming, arcade-quality audio without loading `.wav` or `.mp3` files:

```typescript
// Web Audio Sound Synthesizer for Ally Events
class CuteAudioSynthesizer {
  private ctx: AudioContext | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  // 1. Rescue Chime (Harp Arpeggio: C5 -> E5 -> G5 -> C6)
  playRescueChime() {
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + idx * 0.08);
      gain.gain.setValueAtTime(0.2, this.ctx!.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + idx * 0.08 + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(this.ctx!.currentTime + idx * 0.08);
      osc.stop(this.ctx!.currentTime + idx * 0.08 + 0.35);
    });
  }

  // 2. Shiba Inu Danger Bark
  playDangerBark() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(140, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  // 3. Fairy Sparkle / Shop Bell
  playShopBell() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1760, this.ctx.currentTime); // A6
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.65);
  }
}
```

---

## 8. Caveats

1. **Phaser Arcade Physics vs. Soft Overlap**:
   - As observed in `GameScene.ts:103-110`, physics colliders enforce rigid body blocking. Allies must strictly use `overlap` checks with separation steering rather than standard `collider` to completely eliminate the risk of trapping the player against walls.
2. **Mobile Screen Real Estate**:
   - On a 13x15 grid viewed on mobile portrait screens, adding multiple allies, pets, and merchants could produce visual clutter. The system uses a strict limit of **1 active Rescuable Ally + 1 Companion Pet** simultaneously.
3. **Audio Autoplay Policies**:
   - Modern web browsers require user gesture interaction before unlocking the Web Audio `AudioContext`. Audio triggers will initialize cleanly upon the player's first tap/key press.
4. **No Code Implementation in Main Tree**:
   - In accordance with the Explorer archetype and user global rules, no files in `src/` have been modified. This report provides complete, verified design specifications for synthesis into `GDD.md`.

---

## 9. Conclusion

The Specialized NPCs and Ally Systems designed herein fundamentally expand the emotional and tactical range of the Cute Web Bomberman game:
- **Rescuable Allies** turn destructible block exploration into exciting rescue missions, providing high-value offensive, defensive, sustain, and excavation perks.
- **Companion Pets** introduce a warm, lovable pet-care loop (candy feeding and mood management) that rewards players with critical danger alerts, item magnets, and movement boosts.
- **Wandering Fairy Merchants** give purpose to collected candy currency, establishing a rewarding roguelite progression curve with 10 creative items and a safe haven inside chaotic levels.
- **Helper Spirits & Environmental NPCs** make the grid feel like a living fairy-tale candy grove that gently rewards experimentation and skilled play.
- All mechanics are engineered to operate cleanly within the existing 13x15 grid, HTML5 Canvas 2D zero-asset architecture, and mobile/desktop responsive design.

---

## 10. Verification Method

To independently verify the validity, consistency, and engine compatibility of this design:

1. **Grid Dimensional Consistency**:
   - Inspect `src/game/GameScene.ts:3-5` (`ROWS = 13`, `COLS = 15`, `TILE_SIZE = 40`). Verify that the 3x2 Merchant Stall, 1x1 Cages, and 2-tile pet proximity radiuses fit symmetrically within the grid corridors without obstructing mandatory player pathways.
2. **Speed & Reaction Time Feasibility**:
   - Compare ally speeds (`110 - 175 px/s`) with player speed (`GameScene.ts:189`, `150 px/s`) and bomb fuse (`GameScene.ts:261`, `2000 ms`). At `175 px/s`, an ally can traverse `4.3 tiles` in 1 second, easily clearing the `bombPower = 2` explosion radius (80 px) in under `0.5 seconds`.
3. **Zero-Asset Compliance**:
   - Verify that all visual assets specified in Section 7 rely solely on Unicode emojis (e.g., 🐱, 🐢, 🧚, 🐹, 🐕, 🐇, 🐲, 🎪, 🍬), Canvas 2D procedural shapes (`ctx.ellipse`, `ctx.roundRect`), and Web Audio API tone synthesis, requiring zero `.png`, `.jpg`, or `.mp3` downloads.
4. **Type Structure Check**:
   - Verify that the exported TypeScript interfaces (`IAllyEntity`, `ICompanionPet`, `IShopItem`) match standard Phaser 3 scene patterns without cyclical dependencies.
