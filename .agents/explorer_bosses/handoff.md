# Mid-Boss Encounters: Comprehensive Game Design Document & Technical Specification

**Author**: Boss Battle Architect (`explorer_bosses`)  
**Target Milestone**: M1 (Swarm Brainstorming) / M2 (GDD Integration)  
**Output Target**: `/Users/user/src/bomberman/.agents/explorer_bosses/handoff.md`  
**Reference Codebase**: `/Users/user/src/bomberman/src/game/GameScene.ts`  

---

## Executive Summary

This specification provides the comprehensive game design and technical blueprint for **Mid-Boss Encounters** in the Cute Web Bomberman game. Traditional Bomberman games often struggle with boss design: bosses either feel like spongey normal enemies or execute unfair instant-kill moves that clash with the 2.0-second tactical bomb fuse rhythm.

Our design solves this with a **Fair Telegraphing & Tactical Trap Framework**:
1. **Three Memorable Cute Bosses**:
   - **King Gummy Bear (👑🐻 Colossus of Gelatin)**: Ground-pound, bouncy inertia, gelatin puddles, and splitting mechanics.
   - **Mecha Hamster in Hamster Ball (🐹⚙️ Captain Nibbles)**: High-speed kinetic momentum, rebound angles, electro-rails, and collision traps.
   - **Queen Bee Cupcake (🧁🐝 Queen Mellifera)**: Aerial flight immunity, rotating frosting shields, honey carpets, and dive-bomb groundings.
2. **Multi-Phase State Machines**: Each boss features 3 escalating phases (Phase 1 Introductory, Phase 2 Escalation & Arena Alteration, Phase 3 Enraged Frantic Climax) with visual, behavioral, and tempo shifts.
3. **Pure Canvas & Emoji Aesthetics**: 100% procedural rendering using HTML5 Canvas primitives (radial gradients, bezier squashes, Fresnel reflections, particle emitters) and unicode emojis—zero external raster asset dependencies.
4. **Grid-Synchronized Telegraphing**: Standardized 3-tier warning tiles (Yellow 2.0s -> Orange 1.0s -> Red 0.5s flash) ensuring every attack is 100% avoidable through skillful player positioning.
5. **Rewarding Vulnerability Windows**: Bosses cannot be mindlessly spammed; players must exploit boss movement patterns (momentum dashes, landing stumbles, shield-shattering chain reactions) to create 2.0–3.0s stun windows.

---

# SECTION 1: Master Telegraphing, Fairness & Vulnerability Framework

### 1.1 The Bomberman Boss Dilemma & Core Design Principles
In grid-based bomb games, player attacks possess inherent latency: a bomb placed at $t=0$ detonates at $t=2.0\text{s}$ with a cross blast. If a boss moves arbitrarily at high speeds, hitting it is frustratingly RNG-dependent. Conversely, if a boss stands still, it can be cheesed with overlapping bombs.

To achieve world-class tactical gameplay:
1. **Predictable Trajectory & Commitments**: Bosses commit to attacks with unmistakable windup telegraphs. Once launched, their movement vector is fixed (e.g. rolling until hitting a wall, leaping to a telegraphed tile), allowing the player to solve the spatial equation:
   $$\text{Bomb Placement Time} + \text{Fuse (2.0s)} = \text{Boss Arrival Time}$$
2. **Guaranteed Safe Lanes**: No attack may cover more than 60% of walkable tiles simultaneously. A minimum 2-tile clear escape lane is mathematically guaranteed on every pattern.
3. **Invulnerability Frames (i-Frames)**: After taking damage, bosses flash white/translucent for 1.5 seconds, preventing multiple simultaneous explosions from instantly draining HP.
4. **Stun Window Architecture**: Successful bomb hits trigger an animated 2.0s–3.0s Stun State (dizzy stars 💫, eyes 😵, sound cue), rewarding player execution and providing a brief window for tactical repositioning or combo setup.

### 1.2 Universal 3-Tier Visual Telegraphing Language
All mid-boss attacks utilize a canvas grid-overlay warning system rendered directly onto `GameScene.ts` floor tiles:

| Warning Tier | Timing Window | Tile Visual (HTML5 Canvas) | Audio / Emoji Cue | Player Action |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: Pre-Warning** | 2.0s – 1.5s before hit | Soft blinking pastel yellow border (`#FFEB3B`, 3px dashed line, 0.4 opacity) | Boss plays windup animation (e.g. revving, inhaling); subtle ticking sound | Identify threat vector; begin repositioning |
| **Tier 2: Active Threat** | 1.5s – 0.5s before hit | Translucent amber hatching (`rgba(255, 165, 0, 0.45)` with diagonal lines) | Warning siren pip ⚠️; boss charges forward or ascends | Clear the danger zone; prepare bomb trap outside boundary |
| **Tier 3: Imminent Impact** | 0.5s – 0.0s before hit | Solid high-contrast flashing ruby red (`rgba(255, 30, 60, 0.85)` with pulsing white core) | High-pitch alert tone; ground vibration rumble | Final escape cutoff; immediate blast / impact follows |

---

# SECTION 2: Mid-Boss 1 — King Gummy Bear (👑🐻 Colossus of Gelatin)

```
       [ 👑 ]
     (  • ᴥ •  )   <-- Translucent Gelatin Colossus
    /  [❤️] [❤️] \      Squash & Stretch Canvas Physics
   (   ( 🍯 )   )     Sticky Puddles & Seismic Bounces
    \___/ \___/
```

### 2.1 Visual Concept & Procedural Canvas Sprite Representation
* **Theme**: The pompous, cuddly monarch of the Confectionary Caverns. Made entirely of wobbly, translucent cherry-strawberry gummy gelatin.
* **Footprint & Hitbox**: 2x2 grid tiles (80px x 80px), rounded physics collision capsule (70px x 70px) centered on the grid intersection.
* **Sprite Composition**:
  - Base Emoji: 👑 (floating crown) + 🐻 (chubby gummy bear body) + 🍓 (ruby glaze tint).
  - Canvas Procedural Rendering:
    - **Body Shader**: Rendered via radial gradient from inner radiant magenta (`rgba(255, 80, 130, 0.92)`) to outer gelatinous ruby (`rgba(200, 15, 60, 0.95)`).
    - **Jelly Surface Physics**: In each frame update, the outer silhouette vertex points displace according to a damped harmonic oscillator:
      $$\Delta r(\theta, t) = A \cdot \sin(4\theta + t \cdot \omega) \cdot e^{-\zeta t}$$
      This generates an authentic wobbly jiggle when walking, landing, or struck.
    - **Gloss Highlights**: Dual elliptical white specular patches (`rgba(255, 255, 255, 0.7)`) on the forehead and belly simulate candied gloss.
    - **Crown Physics**: The golden crown (👑) is physics-jointed to his head, wobbling with momentum and tilting sideways when stunned or enraged.

### 2.2 Boss Arena Setup
* **Arena Dimensions**: Standard 13 Rows x 15 Columns (520px x 600px).
* **Block Generation ("Sugar Palace Layout")**:
  - Four central 2x2 unbreakable candy pillars located at `(Row 3-4, Col 3-4)`, `(Row 3-4, Col 10-11)`, `(Row 8-9, Col 3-4)`, `(Row 8-9, Col 10-11)`.
  - Breakable blocks are translucent pink Jelly Blocks (🍧) and green Mint Chew Cubes (🍬).
* **Special Tile Mechanic — Gelatin Residue (Sticky Puddles)**:
  - Whenever King Gummy slams or hops, he deposits 2–3 sticky pink jelly puddles on adjacent tiles.
  - **Player Interaction**: Stepping on a puddle reduces player movement speed by 40% for 2.0 seconds.
  - **Bomb Interaction**: Kicking or punching a bomb into a gelatin puddle does **not** stop it—instead, the bomb gains an elastic bounce, rebounding off walls with increased velocity!

### 2.3 Multi-Phase Architecture

```
+--------------------------------------------------------------------------------+
| KING GUMMY BEAR STATE FLOW                                                      |
|                                                                                |
|  [PHASE 1: 100%-70% HP]  -->  [PHASE 2: 70%-30% HP]   -->  [PHASE 3: 30%-0% HP]|
|  - Ponderous Stomp (80px/s)   - Speed buff (115px/s)        - Enraged (155px/s)|
|  - Royal Leap & Squash        - Sugar Shockwaves (Cross)    - Triple Leap Chain|
|  - 9 Total Hearts             - Jelly Minion Spawning       - Ceiling Collapse |
+--------------------------------------------------------------------------------+
```

#### Phase 1: Royal Bounce & Ponderous Stomp (100% – 70% HP / 9–7 Hearts)
* **Behavior**: King Gummy takes slow, measured footsteps toward the player's quadrant, crushing any breakable jelly block in his direct path.
* **Attacks**:
  1. *Ponderous Stomp*: Marches at 80 px/s along cardinal grid lines. If he contacts a bomb, his gelatinous belly absorbs the impact and gently kicks the bomb 2 tiles away.
  2. *Royal Leap*: King Gummy bends his knees (squash: width 1.4x, height 0.6x for 1.2s), leaps into the air for 1.8 seconds, and lands on a designated 2x2 grid target. Upon landing, a 1-tile radial dust shockwave pushes back anything nearby.
* **Telegraphing**:
  - The 2x2 landing target displays a pulsing yellow ring at $t=-1.8\text{s}$, shifting to an orange hatch at $t=-1.0\text{s}$, and a solid flashing red circle at $t=-0.4\text{s}$. A growing circular drop shadow visually communicates his descent height.

#### Phase 2: Gelatin Shockwave & Jelly Mini-Cubs (70% – 30% HP / 6–4 Hearts)
* **Escalation**: Crown flashes bright gold (👑✨). King Gummy's movement speed increases to 115 px/s.
* **New Abilities**:
  1. *Sugar Shockwave*: Before leaping, King Gummy stomps the floor with both feet. Orthogonal candy shockwaves ripple across all 4 cardinal directions (Up, Down, Left, Right) traveling along unobstructed hallways until hitting an unbreakable pillar or arena border.
  2. *Jelly Budding (Minion Spawn)*: After every second leap, King Gummy's wobble shakes off 2 miniature Gummy Cubs (🐻, 1x1 tile, 1 HP each). The cubs roam randomly (speed 90 px/s). If a cub reaches an armed bomb, it hugs the bomb, preventing the bomb from being kicked or pushed!
* **Arena Manipulation**: His landings permanently shatter any breakable blocks within a 3x3 footprint, progressively clearing the center into an open danger zone.

#### Phase 3: Enraged Chili-Gummy Tantrum (30% – 0% HP / 3–1 Hearts)
* **Visual Shift**: King Gummy turns bright, glowing spicy crimson (`#FF1144`). His crown turns crooked, steam clouds puff from his ears (😤💨), and his eyes switch to fierce angry emojis (😡🔥). BGM accelerates to 160 BPM chiptune swing.
* **Speed Buff**: Base walking speed accelerates to 155 px/s.
* **New Abilities**:
  1. *Triple Bouncing Frenzy*: Instead of single leaps, King Gummy executes 3 rapid chained bounces with only 0.9s airtime each, tracking player movement across the arena.
  2. *Sugar Ceiling Collapse*: Roars in frustration, shaking the arena ceiling. Four giant hard-candy drops (🍬) crash down onto randomly selected player-proximity tiles with 1.5s red exclamation mark (⚠️) warning telegraphs. If a falling candy strikes a bomb, it detonates the bomb prematurely!

### 2.4 Weakness & Tactical Hit Mechanics
* **Bouncy Invulnerability During Movement**: King Gummy's thick gummy skin absorbs frontal bomb blasts while walking—explosions only push him back 1 tile without dealing damage!
* **The "Sticky Landing" Vulnerability Window**:
  - When King Gummy completes a *Royal Leap* and hits the ground, the impact flattens his gummy body into a wide pancake (width 1.6x, height 0.4x). He becomes stuck in the floor for **2.2 seconds** (😵 dizzy eyes, rotating stars 💫).
  - **Damage Execution**: During this 2.2-second window, his gelatinous core is exposed. Detonating a bomb blast that touches any of his 4 grid tiles deals **1 Heart of Damage**.
  - **Tactical Masterplay (Lure Trapping)**: If a skilled player places a bomb directly on one of the 4 telegraphed landing tiles just before King Gummy lands, the impact instantly triggers the bomb, dealing damage and doubling his stun duration to **4.0 seconds**!
* **i-Frames & Anti-Spam**: Once damaged, he flashes translucent white (`alpha = 0.4`) for 1.8 seconds and bounces backward 2 tiles, clearing any adjacent bombs to prevent multi-bomb stacking cheese.

### 2.5 Defeat & Rewards
* **Defeat Animation**: King Gummy's eyes turn into swirling spirals (😵💫). He begins over-inflating with air like a balloon, squeaks frantically, and pops into a massive shower of festive confetti (🎉), leaving behind bouncing sweet treats.
* **Reward Drops**:
  - **Key Item**: *"Royal Gummy Crown"* (Accessory powerup: Gives +1 Max Bomb and grants 15% bounce resistance against incoming knockbacks).
  - **Powerup Bundle**: 3x Fire Up (🔥), 2x Bomb Up (💣), 1x Roller Skates (🛼).
  - **Score Bonus**: 10,000 Base Points + Time Completion Bonus (up to 5,000 pts for sub-90s victory) + "Gummy Colossus Conqueror" achievement banner.

---

# SECTION 3: Mid-Boss 2 — Mecha Hamster in Hamster Ball (🐹⚙️ Captain Nibbles)

```
        /=====\
      /  (•ᴥ•)  \     <-- High-Tech Gyro Hamster Ball
     |  🥽 ⚙️ ⚡  |        Kinetic Momentum & Rail Charges
      \  =====  /         Electrostatic Homing Mines
        \=====/
```

### 3.1 Visual Concept & Procedural Canvas Sprite Representation
* **Theme**: A mad rodent inventor inside a hermetically sealed, high-tech gyroscopic combat sphere with neon treads and laser targeting antennas.
* **Footprint & Hitbox**: 2x2 grid tiles (80px x 80px), spherical circle collider of radius 38px.
* **Sprite Composition**:
  - Pilot Emoji: 🐹 (fluffy hamster face) with 🥽 (gold aviator goggles) and ⚙️ (revolving brass gear teeth).
  - Canvas Procedural Rendering:
    - **Outer Sphere**: Rendered as a transparent glass bubble with dynamic cyan/magenta Fresnel edge glow (`rgba(0, 240, 255, 0.4)` outer ring, refractive white crescent highlight).
    - **Rotational Physics**: When moving horizontally or vertically, the internal wheel geometry and pilot sprite rotate in the direction of motion:
      $$\theta_{\text{rot}}(t) = \theta_0 + \frac{v \cdot \Delta t}{R}$$
    - **Tread Sparks**: Particle system emitting electric yellow spark droplets (⚡) from the contact patch where the ball grips the floor.
    - **Damage Cracks**: As HP drops, procedural jagged white fracture lines (`ctx.lineTo()`) draw across the glass hull.

### 3.2 Boss Arena Setup
* **Arena Dimensions**: 13 Rows x 15 Columns (520px x 600px).
* **Block Generation ("Hamster Speedway Layout")**:
  - Perimeter outer ring is completely clear of blocks, forming an uninterrupted continuous high-speed raceway.
  - The inner 9x11 grid contains dense breakable Cheddar Cheese Blocks (🧀) and Swiss Cheese Walls with open holes.
* **Special Tile Mechanic — Electrostatic Rails (Speed Conduits)**:
  - Rows 2 and 10 feature polished metallic conduit tracks embedded in the floor.
  - **Boss Interaction**: When Captain Nibbles rolls onto an Electrostatic Rail, his velocity accelerates by +80% and the rail stays energized for 1.8 seconds with electric arcs that damage the player if touched.
  - **Bomb Interaction (Rail Gun Effect)**: If a player plants a bomb on an active rail and kicks it, the bomb rockets across the rail at 400 px/s like a hyper-velocity railgun projectile!

### 3.3 Multi-Phase Architecture

```
+--------------------------------------------------------------------------------+
| MECHA HAMSTER STATE FLOW                                                       |
|                                                                                |
|  [PHASE 1: 100%-70% HP]  -->  [PHASE 2: 70%-30% HP]   -->  [PHASE 3: 30%-0% HP]|
|  - Linear Dash (200px/s)     - Rebound Bank Shots          - Pinball Overdrive |
|  - Wall Impact Clangs        - Electro-Mines (Homing)      - Searing Hull Heat |
|  - 10 Total Hearts           - Gyro-Laser 360 Sweep        - Intake Vacuum     |
+--------------------------------------------------------------------------------+
```

#### Phase 1: Kinetic Dash & Bank Shot (100% – 70% HP / 10–8 Hearts)
* **Behavior**: Captain Nibbles scans the grid for the player's alignment along horizontal or vertical corridors.
* **Attacks**:
  1. *Hamster Dash*: Captain Nibbles revs his running wheel inside the sphere (squeaking sound, dust puffs 💨). After a 1.2s windup, he rockets across the hallway at 200 px/s until colliding with an unbreakable wall, obliterating all breakable cheese blocks in that row/col!
  2. *Wall Rebound (Bank Shot)*: Upon hitting a wall, rather than stopping, he rebounds at a 90-degree angle once before his momentum dissipates.
* **Telegraphing**:
  - During the 1.2s rev-up, a vibrant neon-blue arrow trajectory strip illuminates the entire row/column across the grid. The hamster ball tilts backward with goggles glowing brightly.

#### Phase 2: Electro-Mines & Gyro-Laser Sweep (70% – 30% HP / 7–4 Hearts)
* **Escalation**: Twin lightning antennae deploy from the mech chassis (⚡📡). Rolling speed increases to 260 px/s. Rebound capacity increases to 3 consecutive bank shots.
* **New Abilities**:
  1. *Electrostatic Mine Dispersion*: While rolling at top speed, the sphere's rear hatch drops 3 floating spark mines (⚡, 1x1 tile). Mines float in place for 3.5 seconds with a visible digital countdown (3.. 2.. 1.. 💥). If player approaches within 1.5 tiles, the mine accelerates toward the player before exploding in a 1-tile blast.
  2. *Gyro-Laser 360 Sweep*: Captain Nibbles parks at the center of the arena, raises an elevated laser periscope, and charges a magenta laser beam for 1.2s. The laser fires and rotates 360 degrees over 3.0 seconds. 
     * **Fairness / Cover**: Unbreakable walls and intact cheese blocks completely block the laser beam, giving the player tactical shelter!

#### Phase 3: Supercharged Overdrive Pinball (30% – 0% HP / 3–1 Hearts)
* **Visual Shift**: The glass hull turns incandescent orange-hot (`#FF5500`), emergency red warning sirens (🚨) flash atop the dome, and Captain Nibbles chatters frantically while pedaling at supersonic cadence!
* **Speed Buff**: Velocity ramps to a blistering 320 px/s.
* **New Abilities**:
  1. *Continuous Pinball Mode*: Captain Nibbles no longer stops after 1 or 2 rebounds; he enters continuous bouncing ricochet mode for 6 seconds straight, bouncing off walls and pillars like an arcade pinball!
  2. *Turbine Intake Vacuum*: When coming to a temporary halt, the mech reverses its cooling turbine, generating an inward suction cone that pulls the player and placed bombs 1 tile closer before venting a burst of hot steam.

### 3.4 Weakness & Tactical Hit Mechanics
* **Momentum Self-Destruction**: Because Captain Nibbles travels with immense kinetic momentum, he **cannot brake or turn mid-dash**.
* **Head-On Bomb Collision Trap**:
  - When Captain Nibbles dashes along a row and collides head-on with a primed bomb, the immense kinetic energy causes the bomb to detonate instantaneously!
  - **Damage & Hull Breach**: The explosion cracks the mecha sphere, deals **1 Heart of Damage**, and violently halts his momentum.
  - **Dizzy Spin Stun**: The recoil sends Captain Nibbles spinning backwards into a 3.0-second Stun State (the glass cracks, the hamster tumbles upside-down inside the wheel with spiral eyes 😵💫).
* **Chain Reaction Shatter**: If the player sets up a 2-bomb or 3-bomb chain reaction along his dash lane, the amplified blast extends his stun to **4.5 seconds**, providing an enormous window to plant follow-up traps!
* **i-Frames**: After the stun recovers, Captain Nibbles activates an electrostatic barrier (pulsing cyan energy shield) for 2.0 seconds that repels bombs while he repositions.

### 3.5 Defeat & Rewards
* **Defeat Animation**: The outer glass sphere fractures with crystalline sound effects, shattering into sparkling diamond-like shards (💎✨). The cockpit seat ejects with a tiny spring sound (boing!), and Captain Nibbles deploys a micro-parachute (🪂), waving a cute white surrender flag (🏳️) while blushing!
* **Reward Drops**:
  - **Key Item**: *"Gyro-Turbine Roller Skates"* (Grants permanent +25% player movement speed and the ability to kick bombs diagonally!).
  - **Powerup Bundle**: 1x Remote Control Detonator (🕹️), 3x Bomb Up (💣), 2x Full Fire (🔥).
  - **Score Bonus**: 12,500 Base Points + "Speedway Ace" Gold Trophy.

---

# SECTION 4: Mid-Boss 3 — Queen Bee Cupcake (🧁🐝 Queen Mellifera)

```
        (\___/)
       ( 🧁🐝 )       <-- Aerial Confectionary Sovereign
      / { 🌸 } \          Rotating Frosting Shield & Minions
     (  /🍯\  )          Honey Traps & Supersonic Dive-Bombs
       `-----'
```

### 4.1 Visual Concept & Procedural Canvas Sprite Representation
* **Theme**: The imperious monarch of the Sugar Hive Bakery. She hovers gracefully atop an ornate cupcake chariot adorned with royal icing, sugar petals, and buzzing confectionery wings.
* **Footprint & Hitbox**: 2x2 grid tiles (80px x 80px), circular aerial shadow of 36px radius on the floor.
* **Sprite Composition**:
  - Emoji Elements: 🧁 (frosting-swirled chariot base) + 🐝 (regal queen bee with antennae) + 👑 (miniature tiara) + 🍯 (honey scepter) + 🌸 (cherry blossom garnish).
  - Canvas Procedural Rendering:
    - **Aerodynamic Wing Flutter**: Dual gossamer wings rendered with high-frequency harmonic flutter (`cos(time * 40)`), creating motion-blurred translucent wings with rainbow prismatic rim light.
    - **Swirled Marshmallow Frosting**: Procedural spiral curves drawn with quadratic bezier lines, shifting between pastel pink (`#FFB6C1`) and lavender (`#E6E6FA`) with animated multi-colored sprinkle specks drifting downwards.
    - **Honey Dripping Particles**: Physics-based golden honey droplets (`rgba(255, 190, 0, 0.9)`) drip periodically from her scepter, creating viscous pools on the arena floor upon landing.
    - **Flight Altitude Illusion**: A dynamic drop shadow on the ground scales inversely with her flight height ($r_{\text{shadow}} = r_0 \cdot \frac{h_{\text{max}}}{h}$), providing intuitive altitude feedback.

### 4.2 Boss Arena Setup
* **Arena Dimensions**: 13 Rows x 15 Columns (520px x 600px).
* **Block Generation ("Honeycomb Hive Layout")**:
  - Hexagonal clusters of amber Honeycomb Wax Blocks (🍯). Destroying a wax block has a 50% chance of yielding delicious honey syrup or rare fruit powerups.
  - Four corner Honey Extractors (unbreakable mechanical fixtures) that hum with sweet electrical energy.
* **Special Tile Mechanic — Honey Glaze & Caramelization**:
  - Floors covered in golden honey reduce player movement speed by 35% and prevent running dashes.
  - **Caramelization Reaction**: If a bomb explosion's flame touches a honey tile, the intense heat instantly caramelizes the liquid into crystalline brittle candy for 6.0 seconds! While caramelized, the tile becomes solid smooth floor that players can run across at normal speed, and stepping on it shatters it into sparkle bonus points (✨ +100 pts)!

### 4.3 Multi-Phase Architecture

```
+--------------------------------------------------------------------------------+
| QUEEN BEE CUPCAKE STATE FLOW                                                   |
|                                                                                |
|  [PHASE 1: 100%-75% HP]  -->  [PHASE 2: 75%-33% HP]   -->  [PHASE 3: 33%-0% HP]|
|  - Aerial Flight Hover       - Frosting Shield (4 Petals)   - Supersonic Dive  |
|  - Sugar Stinger Salvos      - Worker Bee Minions (Bomb-Thief) - Royal Sugar Rush|
|  - 12 Total Hearts           - Honey Carpet Drizzles       - Pollen Crossburst |
+--------------------------------------------------------------------------------+
```

#### Phase 1: Aerial Sovereign & Stinger Salvo (100% – 75% HP / 12–10 Hearts)
* **Behavior**: Queen Mellifera hovers at medium altitude (height 40px above floor), cruising in a gentle figure-8 patrol pattern. Because she floats, ground-level blocks do not obstruct her path.
* **Attacks**:
  1. *Sugar Stinger Salvo*: Queen Mellifera halts in mid-air, brandishes her honey scepter, and targets the player's grid coordinate. She fires 3 rapid candy stingers (🍯🎯) with 0.8s intervals. Each stinger embeds in the grid tile, creating a localized hazard zone for 2.0s before dissolving.
* **Telegraphing**:
  - A bright magenta floral targeting reticle appears centered on the player's tile 1.0s before each stinger drops, accompanied by an ascending musical harp arpeggio.

#### Phase 2: Rotating Frosting Shield & Worker Minions (75% – 33% HP / 9–5 Hearts)
* **Escalation**: Queen Mellifera summons the *Royal Frosting Barrier*—4 spinning sugar-flower shields (🌸🌸🌸🌸) that orbit her chariot in a continuous radius, absorbing all incoming bomb blast waves!
* **New Abilities**:
  1. *Honey Drizzle Carpet*: Queen Mellifera flies in a straight line across an entire row or column, spraying a carpet of viscous honey over 5 contiguous tiles.
  2. *Worker Bee Cupcake Drones (Minion Swarm)*: Summons 2 Worker Bees (🐝🧁, 1x1 tile). Worker bees possess a unique and mischievous AI: they seek out player bombs, pick them up with tiny legs, fly them 3 tiles away, and drop them next to the player!
* **Telegraphing**:
  - The flight path for *Honey Drizzle Carpet* glows in vibrant golden light for 1.5 seconds, while Queen Mellifera performs an elegant pirouette spin in the air.

#### Phase 3: Hive Queen's Sugar Rush Frenzy (33% – 0% HP / 4–1 Hearts)
* **Visual Shift**: Queen Mellifera consumes royal super-jelly! Her frosting turns fiery dark chocolate chili with golden glowing runes, her crown blazes with miniature sparkler flares, and her wings buzz with a deep, menacing drone (😡⚡).
* **Speed Buff**: Flight speed increases by 65%.
* **New Abilities**:
  1. *Supersonic Royal Dive*: Queen Mellifera ascends completely off-screen for 1.2 seconds. A massive 3x3 floral danger grid flashes violently on the player's location. Queen Mellifera crashes down at supersonic speed, sending out a radial shockwave of boiling molten caramel!
  2. *Pollen Cross-Bomb Barrage*: Deploys 6 floating floral pollen pods across the arena that detonate in four-way cross explosions synchronized to the background music beat.

### 4.4 Weakness & Tactical Hit Mechanics
* **The Flight Immunity Paradox**: Because Queen Mellifera hovers in the air, standard ground bomb flames cannot reach her during normal flight! To defeat her, the player must utilize three specific ground mechanics:
  1. **Phase 2 Frosting Shield Popping**: The 4 rotating flower shields orbit at ground level. Detonating bombs near her destroys the flower shields one by one. Once all 4 are popped, her flight engine overstrains.
  2. **Corner Pollen Launcher Sniping**: The arena's 4 corner Pollen Launchers trigger when hit by a bomb blast. Triggering a launcher fires a sticky pollen blast that hits Queen Mellifera, grounding her for **3.0 seconds**!
  3. **Dive-Bomb Recovery Stun ("Sugar Coma")**:
     - When she performs her Phase 3 *Supersonic Royal Dive*, the player must sprint out of the 3x3 red warning zone at the last second.
     - When Queen Mellifera slams into the floor, her cupcake chariot sinks 20cm into the ground tiles, trapping her in a sticky crater for **2.5 seconds** (😵 dazed expression, wilted wings).
     - **Damage Execution**: Detonating a bomb against her grounded chassis deals **1 Heart of Damage** and triggers a sweet splash stagger!
* **i-Frames & Repositioning**: When damaged, Queen Mellifera emits an ultrasonic pollen screech that pushes player and bombs back 2 tiles, then ascends smoothly back into the air with 2.0 seconds of golden invulnerability shimmer.

### 4.5 Defeat & Rewards
* **Defeat Animation**: The cupcake chariot dissolves into a fluffy cloud of sweet pastel steam. Queen Mellifera shrinks down into an adorable, chubby bumblebee the size of a plum, rubs her eyes apologetically with her front paws (🥺🐝), and buzzes away, leaving behind the Golden Honeycomb Vault!
* **Reward Drops**:
  - **Key Item**: *"Queen's Honeycomb Amulet"* (Grants player complete immunity to sticky honey slowdown tiles and allows walking through breakable honeycomb blocks without placing bombs!).
  - **Powerup Bundle**: 1x Honey Bomb (bombs produce sticky honey blasts that slow enemies), 4x Max Fire (🔥), 1x Extra Heart Container (❤️).
  - **Score Bonus**: 15,000 Base Points + "Master Apiarist" Platinum Seal.

---

# SECTION 5: Comparative Boss Matrix & Technical Implementation Spec

### 5.1 Comprehensive Boss Comparison Matrix

| Attribute | Mid-Boss 1: King Gummy Bear | Mid-Boss 2: Mecha Hamster (Capt. Nibbles) | Mid-Boss 3: Queen Bee Cupcake |
| :--- | :--- | :--- | :--- |
| **Aesthetic Motif** | 👑🐻 Translucent Gelatin & Candies | 🐹⚙️ High-Tech Gyro Mech & Rodent Sci-Fi | 🧁🐝 Confectionary Royalty & Floral Honey |
| **Grid Footprint** | 2x2 tiles (80x80 px) | 2x2 tiles (80x80 px) | 2x2 tiles (80x80 px) |
| **Hit Points (HP)** | 9 Hearts (3 / 3 / 3 per phase) | 10 Hearts (3 / 3 / 4 per phase) | 12 Hearts (3 / 4 / 5 per phase) |
| **Movement Style** | Ground march & heavy parabolic leaps | High-speed linear rolls & 90° rebounds | Aerial 3D hovering, ignoring floor blocks |
| **Arena Hazard** | Sticky pink gelatin puddles (-40% speed) | Energized electrostatic speed rails (⚡) | Viscous honey floors & flying bomb thieves |
| **Primary Telegraph** | 2x2 descending shadow + yellow/red tiles | 1-row directional laser arrows + rev audio | 3x3 target reticle + descending harp arpeggio |
| **Vulnerability Trigger** | Landing squash pancake state (2.2s) | Head-on collision with primed bomb | Sniping via corner launcher / Dive-bomb miss |
| **Enraged Mechanic** | Spicy chili red form + falling ceiling candy | Searing hot continuous ricochet pinball | Molten caramel supersonic dive + pollen barrage |
| **Exclusive Reward** | Royal Gummy Crown (+1 Bomb, Knockback Res) | Gyro Roller Skates (+25% Spd, Diag Kicks) | Honeycomb Amulet (Slow Immunity, Honey Bomb) |

### 5.2 Technical Class Architecture for Phaser / Next.js Engine

To seamlessly integrate into `src/game/GameScene.ts` without introducing external dependencies, all mid-bosses derive from an extensible `BaseBoss` class:

```typescript
// Proposed Architecture for src/game/bosses/BaseBoss.ts
import Phaser from 'phaser';

export enum BossState {
  INTRO = 'INTRO',
  IDLE = 'IDLE',
  WINDUP = 'WINDUP',
  ATTACKING = 'ATTACKING',
  STUNNED = 'STUNNED',
  INVULNERABLE = 'INVULNERABLE',
  ENRAGED = 'ENRAGED',
  DEFEATED = 'DEFEATED'
}

export abstract class BaseBoss extends Phaser.Physics.Arcade.Sprite {
  protected maxHp: number;
  protected currentHp: number;
  protected phase: number = 1;
  protected bossState: BossState = BossState.INTRO;
  protected isInvulnerable: boolean = false;
  protected stunTimer: number = 0;
  
  // Telegraphing visual graphics pipeline
  protected telegraphGraphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, hp: number) {
    super(scene, x, y, texture);
    this.maxHp = hp;
    this.currentHp = hp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.telegraphGraphics = scene.add.graphics();
  }

  abstract updateAI(time: number, delta: number): void;
  abstract handlePhaseTransition(newPhase: number): void;
  abstract onStunState(durationMs: number): void;
  abstract executeAttackRotation(): void;

  public takeBombDamage(damage: number = 1): boolean {
    if (this.isInvulnerable || this.bossState === BossState.DEFEATED) {
      return false;
    }
    
    // Check if in valid vulnerability window
    if (!this.canTakeDamage()) {
      this.playDeflectEffect();
      return false;
    }

    this.currentHp -= damage;
    this.scene.cameras.main.shake(150, 0.01);
    this.triggerIFrames(1500);

    // Evaluate Phase thresholds
    const hpRatio = this.currentHp / this.maxHp;
    if (hpRatio <= 0.33 && this.phase < 3) {
      this.phase = 3;
      this.handlePhaseTransition(3);
    } else if (hpRatio <= 0.70 && this.phase < 2) {
      this.phase = 2;
      this.handlePhaseTransition(2);
    }

    if (this.currentHp <= 0) {
      this.onDefeat();
    }
    return true;
  }

  protected triggerIFrames(durationMs: number) {
    this.isInvulnerable = true;
    this.scene.tweens.add({
      targets: this,
      alpha: 0.3,
      duration: 100,
      yoyo: true,
      repeat: Math.floor(durationMs / 200),
      onComplete: () => {
        this.alpha = 1.0;
        this.isInvulnerable = false;
      }
    });
  }

  protected drawTelegraphGrid(tiles: { row: number; col: number }[], tier: 1 | 2 | 3, tileSize: number = 40) {
    this.telegraphGraphics.clear();
    const colors = { 1: 0xffeb3b, 2: 0xffa500, 3: 0xff2244 };
    this.telegraphGraphics.lineStyle(2, colors[tier], 0.9);
    this.telegraphGraphics.fillStyle(colors[tier], tier === 3 ? 0.6 : 0.25);

    tiles.forEach(t => {
      this.telegraphGraphics.fillRect(t.col * tileSize, t.row * tileSize, tileSize, tileSize);
      this.telegraphGraphics.strokeRect(t.col * tileSize, t.row * tileSize, tileSize, tileSize);
    });
  }

  abstract canTakeDamage(): boolean;
  abstract onDefeat(): void;
}
```

### 5.3 Cute UI Boss Health HUD Specification
During Mid-Boss encounters, the top viewport displays a dedicated Cute Boss Vitality Bar:
* **Frame & Styling**: Pure CSS / Canvas rounded capsule container with candy cane borders (`border-radius: 24px; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(8px)`).
* **Boss Avatar**: An animated bouncing boss emoji (👑🐻 / 🐹⚙️ / 🧁🐝) on the left that tilts with damage taken.
* **Heart / Candy Meter**: Displays individual Heart Icons (❤️) that shatter with cute sparkle particles (✨) when depleted.
* **Phase Marker Pips**: Two glowing star dividers (⭐) denoting Phase 2 and Phase 3 thresholds.
* **Enrage Glow Effect**: When entering Phase 3, the entire HUD pulses with an animated soft red gradient glow (`box-shadow: 0 0 16px rgba(255, 60, 60, 0.7)`).

---

# SECTION 6: Handoff Protocol Specification (5-Component Structure)

### 1. Observation
* **Codebase State**: Inspected `/Users/user/src/bomberman/src/game/GameScene.ts`. The game runs on Phaser 3 with Arcade physics on a $13 \times 15$ grid (`TILE_SIZE = 40px`). Bombs have a 2000ms fuse and explode along cardinal directions stopping at walls (`TILE_WALL = 1`) and destroying breakable blocks (`TILE_BLOCK = 2`).
* **Requirements Context**: `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md` requires Mid-bosses with multi-phase mechanics, cute aesthetic, pure Canvas/CSS/emojis without external image assets.
* **Collaborative State**: `/Users/user/src/bomberman/COLLABORATION.md` emphasizes cross-platform optimization (mobile touch + keyboard) and cute candy aesthetic.

### 2. Logic Chain
1. **From Turn Latency to Boss Telegraphing**: Because bomb explosions require 2.0s to detonate, normal real-time bosses who dodge erratically make gameplay frustrating. Therefore, every boss must have clear windups (1.2s – 1.8s) and fixed trajectories or resting states where bomb detonation matches enemy presence.
2. **From 13x15 Grid to 2x2 Boss Footprints**: A 1x1 boss feels too small and easily trapped in corridors; a 3x3 boss restricts movement too severely in a 13x15 arena. A **2x2 footprint (80x80px)** allows bosses to dominate space while still allowing players 2-tile flanking routes.
3. **From Assetless Rule to Procedural Canvas & Emojis**: Using composite emojis (👑 + 🐻, 🐹 + ⚙️, 🧁 + 🐝) combined with HTML5 Canvas procedural effects (harmonic wobbling, Fresnel rims, particles) satisfies the "zero external images" requirement while achieving visual polish superior to flat color blocks.
4. **From Cheese Prevention to Stun/i-Frame Windows**: Without i-frames, 4 simultaneous bombs deal instant lethal damage. Implementing a 1.5s i-frame window paired with explicit 2.0s–3.0s stun states ensures players must repeatedly demonstrate tactical skill across all 3 phases.

### 3. Caveats
* **Canvas Performance on Mobile**: Complex per-frame sine-wave distortion for jelly wobbles should be capped at 60 FPS and use lightweight lookup tables or simple scaling transforms on low-power mobile devices.
* **Collision Corner Catching**: 2x2 bosses moving along a grid can get caught on corner tiles. Pathfinding must employ corner-snapping or tile rounding logic to prevent bosses from becoming unintentionally stuck.
* **Player Power Scaling**: If the player has accumulated 5+ Fire Up powerups, bomb flames cross the entire map. Arena design must utilize unbreakable pillars (`TILE_WALL`) to provide bosses natural blast shields during non-stun states.

### 4. Conclusion
The three designed Mid-Bosses (**King Gummy Bear**, **Mecha Hamster in Hamster Ball**, and **Queen Bee Cupcake**) provide exceptional gameplay variety:
- King Gummy tests **spatial timing & lure trapping**.
- Mecha Hamster tests **trajectory anticipation & head-on collision timing**.
- Queen Bee Cupcake tests **arena fixture interaction, minion prioritization & dive dodging**.
All mechanics adhere strictly to the cute aesthetic, assetless Canvas/Emoji constraints, and multi-phase progression.

### 5. Verification Method
1. **GDD Inclusion Verification**: Verify that the GDD author incorporates all three mid-bosses with their 3-phase progression, telegraphing tables, and reward tables into `/Users/user/src/bomberman/GDD.md`.
2. **Engine Fit Verification**: Verify that all coordinates and movement speeds match the grid parameters ($13 \times 15$, $40\text{px}$ tile size, $2000\text{ms}$ bomb fuse) in `/Users/user/src/bomberman/src/game/GameScene.ts`.
3. **Assetless Visuals Verification**: Confirm that all sprite definitions rely strictly on unicode emojis and standard Canvas 2D / Phaser graphics primitives.
