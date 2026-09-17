# Comprehensive Specification Mining Report: Epic Bosses, Map Crises, Infinite Scaling, Game Modes & Meta-Progression

**Author**: Survey Explorer 1 (Specification Miner)  
**Target Workspace**: `/Users/user/src/bomberman/.agents/explorer_survey_1/`  
**Date**: 2026-09-17  
**Scope**: Complete exhaustive specification and behavioral taxonomy for:
1. Multi-phase epic bosses (visual patterns, telegraphs, phase transitions, enrage mechanics).
2. Dynamic Stellaris-style map crises (orbital bombardments, solar flares, creeping lava/void hazards, dimensional rifts).
3. Infinite scaling difficulty & endless/crisis mode.
4. New game modes (Crisis Survival, Boss Rush, Endless Gauntlet).
5. Permanent/run progression systems (meta-progression, perks, relics, persistent score/trophy unlocks).
6. State persistence, API recovery, and Zero-GC/Soak architectural constraints.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Epic Bosses | BaseBoss FSM Engine | Centralized state machine (`INTRO`, `IDLE`, `WINDUP`, `ATTACKING`, `STUNNED`, `INVULNERABLE`, `ENRAGED`, `DEFEATED`) with committed telegraphs | Frame delta `dt`, boss state, HP ratio | Velocity vectors, state transition events, animation flags | Stun timer interrupts active attack cleanly; resets timers | GDD.md §2.7 & Architecture probe |
| 2 | Epic Bosses | 3-Tier Visual Telegraphing Grid | Universal floor tile danger indicators (Yellow Pre-warning 2.0s -> Amber Threat 1.0s -> Flashing Red Impact 0.5s) | Target grid coordinates `(r, c)[]`, telegraph tier `1\|2\|3` | Procedural canvas line dashes, fills, and icon pings | Clamped to walkable grid; never covers >60% of arena | GDD.md §2.2 & Boss framework |
| 3 | Epic Bosses | Multi-Bomb Chain Buffer | 150ms buffering window before post-hit i-frames to reward simultaneous multi-bomb detonation combos | Consecutive bomb blasts within 150ms | Accumulated combo damage and extended stun duration up to 4.5s | Single bomb triggers standard 3.0s stun and 1500ms i-frames | GDD.md §2.7 & Remediation Matrix #4 |
| 4 | Epic Bosses | King Gummy Bear: Royal Leap & Stomp | 2x2 gelatin colossus leaps into air with 1.8s airtime, landing with 1-tile radial shockwave | Phase 1-3 AI state, player position quadrant | 2x2 landing target telegraph, ground shockwave, sticky gelatin puddles | If landing tile blocked by unbreakable wall, shifts to nearest empty tile | GDD.md §2.3 |
| 5 | Epic Bosses | King Gummy Bear: Gelatin Shockwave & Buds | Stomps floor to ripple orthogonal cross shockwaves and shakes off 2 miniature Gummy Cubs | Phase 2 trigger (HP <= 70%), leap completion | 4-way hallway shockwaves, 2x 1-HP Gummy Cubs that hug bombs | Max 4 active cubs on screen at once to prevent entity spam | GDD.md §2.3 |
| 6 | Epic Bosses | King Gummy Bear: Chili Enrage Tantrum | Spicy crimson form (`#FF1144`), steam puffs, 155 px/s speed, triple rapid bounces, ceiling candy drops | Phase 3 trigger (HP <= 30%) | 3x chained 0.9s airtime bounces tracking player, 4x falling candy reticles | Falling candy detonates bombs prematurely without softlock | GDD.md §2.3 |
| 7 | Epic Bosses | Captain Nibbles: Kinetic Dash & Bank Shot | 2x2 gyroscopic ball revs up for 1.2s and rockets down corridor at 200 px/s, rebounding at 90° | Line-of-sight raycast detection, Phase 1 AI | Full-lane directional arrow telegraph strip, cheese block pulverization | Rebound stops if hitting corner pocket to prevent infinite loop | GDD.md §2.4 |
| 8 | Epic Bosses | Captain Nibbles: Electro-Mines & Gyro-Laser | Deploys 3 floating timed spark mines and sweeps a 360° magenta laser from arena center | Phase 2 trigger (HP <= 70%), center park command | 3x homing mines (3.5s fuse), rotating 360° laser beam over 3.0s | Solid walls/cheese blocks provide 100% line-of-sight cover | GDD.md §2.4 |
| 9 | Epic Bosses | Captain Nibbles: Overdrive Pinball & Vacuum | Incandescent orange hull (`#FF5500`), 320 px/s speed, 6.0s continuous pinball ricochet, intake suction | Phase 3 trigger (HP <= 30%) | Continuous wall-bouncing, 1-tile inward suction cone before steam vent | Head-on collision with primed bomb cracks hull and stuns for 3.0s | GDD.md §2.4 |
| 10 | Epic Bosses | Queen Mellifera: Aerial Sovereign Flight | 2x2 hovering cupcake chariot cruising in figure-8 at 40px altitude, immune to floor bomb flames | Phase 1-3 flying state, altitude height | Prismatic wing flutter, drop shadow scaling, 3x sugar stinger salvo | Altitude protects from floor blasts; vulnerable only when grounded | GDD.md §2.5 |
| 11 | Epic Bosses | Queen Mellifera: Frosting Shield & Worker Bees | 4 rotating sugar-flower shields absorbing blasts, honey carpet, and 2 worker bees stealing bombs | Phase 2 trigger (HP <= 75%) | 4 orbiting shields, 5-tile honey line, 2 worker bees dropping bombs on player | Worker bees drop bombs at safe distance; bomb slot refunded | GDD.md §2.5 |
| 12 | Epic Bosses | Queen Mellifera: Supersonic Dive & Pollen Barrage | Consumes royal jelly, ascends off-screen, crashes into 3x3 reticle, deploys 6 cross-bomb pollen pods | Phase 3 trigger (HP <= 33%) | 3x3 floral danger reticle, boiling caramel shockwave, 6 cross-blast pods | Dive-bomb miss buries chariot in floor ("Sugar Coma") for 2.5s stun | GDD.md §2.5 |
| 13 | Epic Bosses | Void Devourer Avatar: Event Horizon Singularity | Cosmic marshmallow colossus with gravitational pull, teleportation between rifts, and beam barrages | Phase 1-3 Stellaris Boss trigger, Void Incursion | Gravitational pull (25 px/s), void rifts, cosmic starbursts | Iridescent Sugar Shield shattered only by Supernova Cleanse | ORIGINAL_REQUEST.md & GDD §5.2 |
| 14 | Epic Bosses | Steam Toy Titan: Overclocked Cataclysm | Massive 2x2 brass juggernaut with hydraulic ground stomps, cog saw blades, and steam flamethrower | Phase 1-3 Clockwork Boss trigger, Toy Rebellion | Quake shockwaves, rolling saw blades, flame cones, conveyor reversals | Short-circuited and stunned for 5.0s via 4-way conduit overload | ORIGINAL_REQUEST.md & GDD §5.3 |
| 15 | Map Crises | Pastel Void: 3-Stage Incursion | Whispers (0-20s grace) -> Outbreak (20-80s creeping void) -> Climax (80-110s Avatar & Singularity) | Match timer / block threshold trigger | Chromatic aberration, 4 void rifts, expanding void tiles, Voidling spawns | Perimeter walls immune; Singularity at 65% walkable tiles | GDD.md §5.2 |
| 16 | Map Crises | Pastel Void: Purification Prisms | 2 corner crystal prisms charged via adjacent bomb shockwaves (+33% per blast) | Bomb explosion intersecting prism tile | 3x3 local void immunity aura, -50% global creep speed per prism, Supernova Cleanse | Ambient walking does not charge; requires explicit blast hit | GDD.md §5.2 |
| 17 | Map Crises | Toy Rebellion: 3-Stage Mechanical Takeover | Ticking Protocol (60->120 BPM) -> Great Overhaul (cogs, belts, EMP) -> Dynamo Climax | Match timer / bomb count trigger | Metronome audio, 8 brass cog blocks, moving belts, EMP pulse chimes | Disarmed bombs refund player capacity slot in real-time | GDD.md §5.3 |
| 18 | Map Crises | Toy Rebellion: Dynamo Overload & Capacitors | Emergency canisters grant +3 bomb slots; player executes 4-way simultaneous chain into conduits | Overdrive phase start, bomb detonations | Overload short-circuits Dynamo Core, disables invaders, restores waffles | 1.5s tolerance window; partial hits reset safely | GDD.md §5.3 |
| 19 | Map Crises | Orbital Bombardment: Kinetic Cataclysm | Dreadnought fleet targets arena with sweeping laser reticles, kinetic salvos, and particle lances | Crisis trigger: Space/Tech World or Survival Mode | Red targeting crosshairs, falling orbital kinetic shells, crater decals | 3x corner Uplink terminals can be bombed to summon counter-shields | ORIGINAL_REQUEST.md & prompt |
| 20 | Map Crises | Solar Flares: Coronal Mass Ejection | Ambient lighting shifts golden-amber; 4.0s solar flare waves sweep cardinal corridors | Crisis trigger: Solar World or Survival Mode | Coronal flare sweeps, flash-igniting all armed bombs immediately | Indestructible pillars (`TILE_WALL`) provide 100% line-of-sight shelter | ORIGINAL_REQUEST.md & prompt |
| 21 | Map Crises | Creeping Lava: Tectonic Rupture | Molten lava fissures breach perimeter corridors and slowly creep inward tile-by-tile | Crisis trigger: Volcanic World or Survival Mode | Impassable boiling lava tiles, incinerates soft blocks, steam vents | Ice Bombs or Water Hydrants solidify lava into breakable obsidian | ORIGINAL_REQUEST.md & prompt |
| 22 | Map Crises | Dimensional Rifts: Subspace Inversion | 3 Subspace tears open, warping entities across map and introducing toroidal edge wrap-around | Crisis trigger: Quantum World or Survival Mode | Dimensional wormholes, mirror duplicate phantoms, toroidal corridors | Closing 3 spires with polarized bomb blasts seals the rifts | ORIGINAL_REQUEST.md & prompt |
| 23 | Map Crises | Stellaris Situation Log HUD | Top-mounted glassmorphic crisis HUD displaying current Act, Threat Meter gauge, and Objective | Crisis state changes | Segmented progress bar, pulsing threat alert, real-time objective pills | Responsive layout scales on mobile without blocking controls | GDD.md §5.4 |
| 24 | Scaling Difficulty | Mathematical Scaling Engine | Algorithmic scaling formulas for enemy speed, HP, spawn count, and aggro based on wave $W$ | Wave index $W \in [1, \infty)$ | $v(W)$, $HP(W)$, $N(W)$, $R(W)$, score multiplier $M(W)$ | Soft caps enforce physics stability: max speed 2.2x, max 14 enemies | ORIGINAL_REQUEST.md §143 |
| 25 | Scaling Difficulty | Dynamic Wave Room Mutators | Procedural affixes altering wave physics (Speed Demon, Volatile Conduits, Dense Forts, Low Gravity) | Wave generation seed | Environment physics mutators, bomb modifier tags, hazard spawn rates | Mutators do not stack conflicting movement physics | ORIGINAL_REQUEST.md §143 |
| 26 | Game Modes | Crisis Survival Mode | Continuous survival mode with timer counting UP; escalating crises trigger every 60 seconds | Game Mode Selection: Crisis Survival | Escalating crisis waves, emergency drop pods every 45s, endless survival | Permadeath records high survival time and crisis count | ORIGINAL_REQUEST.md §143 & dispatch |
| 27 | Game Modes | Boss Rush Mode | Back-to-back gauntlet fighting all Epic Bosses with persistent health and intermission shops | Game Mode Selection: Boss Rush | Sequential boss arenas, 20s Madame Bonbon rest stops, time-attack medals | Defeat terminates run; clear time records medal ranking | ORIGINAL_REQUEST.md §143 & dispatch |
| 28 | Game Modes | Endless Gauntlet Mode | Infinite procedural rooms (Clear, Elite, Vault, Crisis, Boss every 5th) with roguelite perk draft | Game Mode Selection: Endless Gauntlet | Room transitions, 3-card boon draft upon clear, elevator checkpoints | Checkpoints unlocked every 10 rooms (Room 10, 20, 30) | ORIGINAL_REQUEST.md §143 & dispatch |
| 29 | Meta-Progression | Dual-Currency Economy | In-run Star Candies (🍬) and persistent Cosmic Sugar Essence (✨) awarded from bosses/crises | Drops, kills, boss defeats, stage clears | Real-time currency counters, persistent hub balance | Essences never reset on death; Candies convert to score | GDD.md §3.6 & prompt |
| 30 | Meta-Progression | 4-Branch Confectionery Perk Tree | Hub village perk tree with 16 permanent upgrades across Baking, Sugar Rush, Resilience, and Alchemy | Player essence balance, perk levels | Permanent stat buffs: starting bombs, corner-sliding assist, second wind | Enforces hard caps to prevent breaking grid physics | ORIGINAL_REQUEST.md §143 & prompt |
| 31 | Meta-Progression | Equippable Relic System | Run-altering artifacts with powerful synergies (e.g. Pocket Chrono, Gelatin Core, Pyroclastic Prism) | Relic drop from Vaults / Bosses / Shop | Synergistic gameplay modifiers, passive procs, active triggers | Max 2 equippable relic slots; duplicate pickups upgrade tier | ORIGINAL_REQUEST.md §143 & prompt |
| 32 | Meta-Progression | Persistent Trophy & Skin Showcase | 25+ persistent achievements unlocking cosmetic player skins, bomb particle palettes, and titles | Milestone checks (damage, chains, waves) | Unlocked badges, cosmetic selectors in village hub | Unlocks persist permanently in browser local storage | ORIGINAL_REQUEST.md §143 & prompt |
| 33 | Resilience & Infra | State Serialization & Quota Recovery | Comprehensive `GameSaveState` JSON schema with checksums, local storage autosave, and recovery | Room clear, wave end, crisis resolution | Snapshot saved to `localStorage`; instant reload recovery | Corrupted save safely rolls back to last known good checkpoint | ORIGINAL_REQUEST.md §146 |
| 34 | Engine & Perf | Zero-GC Object Pooling Architecture | Pre-allocated pools for particles, blast rays, projectiles, float text, and audio nodes | Entity spawn and despawn requests | Recycled instances; zero runtime heap allocations in render loop | Verified by 10,000-frame soak test harness | ORIGINAL_REQUEST.md §144 |
| 35 | Audio Synthesis | Procedural Web Audio Crisis Synth | Pure procedural audio synthesis for boss roars, metronome clicks, void drones, and laser sweeps | Audio event triggers | Real-time oscillator / noise / filter synthesis; zero external audio files | Browser autoplay policy compliant (unlock on first user touch) | GDD.md §3.8 & §5.6 |

---

## Edge Cases

| # | Feature | Input / Condition | Observed & Specified Behavior |
|---|---------|-------------------|-------------------------------|
| 1 | Epic Bosses | Multi-bomb chain hits boss exactly on phase transition boundary | The 150ms combo buffering window registers all simultaneous blasts. If damage crosses Phase 2/3 threshold, transition logic executes immediately after the 150ms window, triggering phase cutscene/invulnerability without skipping enrage animations. |
| 2 | Epic Bosses | King Gummy Bear lands directly on a placed bomb | The bomb detonates instantly on contact. King Gummy takes 1 heart of damage and his stun duration is doubled from 2.2s to 4.0s (Masterplay Lure Trapping). Player receives bonus score toast `🎯 CRITICAL LANDING TRAP! +2,000`. |
| 3 | Epic Bosses | Captain Nibbles hits a bomb while rolling at 320 px/s | Head-on collision triggers instant bomb detonation. The kinetic shock breaks through his frontal shield, inflicts 1 heart of damage, and sends Captain Nibbles spinning backwards 2 tiles into a 3.0s dizzy stun (`😵💫`). |
| 4 | Epic Bosses | Queen Mellifera dive-bombs into a tile containing a primed bomb | The bomb detonates on supersonic impact. Queen Mellifera takes 1 heart damage, and her cupcake chariot gets lodged 20cm into the floor crater ("Sugar Coma"), extending her grounded stun window to 3.5s. |
| 5 | Epic Bosses | Boss is pushed or knocked back against indestructible outer arena walls | Velocity and position vectors clamp cleanly against wall boundary tiles (`r = 1..ROWS-2, c = 1..COLS-2`). Wall collision flags set to true; no clipping or out-of-bounds penetration occurs. |
| 6 | Epic Bosses | Multiple players or player + ally detonate bombs on boss simultaneously | Combo counter increments per distinct blast ID within 150ms. Boss HP decrements by total valid hits up to current phase cap; boss triggers single collective i-frame window rather than stacking multiple blink tweens. |
| 7 | Map Crises | Pastel Void Creep reaches an indestructible perimeter wall (`TILE_WALL`) | Outer perimeter border walls (`r === 0 \|\| r === ROWS-1 \|\| c === 0 \|\| c === COLS-1`) are marked `IMMUNE_TO_VOID`. The creep skips the wall and redirects to adjacent valid soft blocks or empty tiles. |
| 8 | Map Crises | Pastel Void Creep reaches 65% of walkable tiles (72 tiles) | Singularity Threshold triggers: Board-wide siren chimes, screen collapses into a gravitational black hole at `(6, 7)`, and the match terminates cleanly with `GAME OVER: THE COSMOS WAS CONSUMED`. |
| 9 | Map Crises | Bomb placed on Clockwork Conveyor Belt moving toward a solid wall | The belt moves the bomb at 80 px/s until contacting the wall. The bomb halts smoothly against the wall face while the conveyor visual continues rolling beneath it; bomb fuse countdown proceeds without interruption. |
| 10 | Map Crises | Clockwork EMP pulse chimes while bomb fuse has 0.05s remaining | Physics engine priority: If fuse <= 0.05s, normal detonation executes. The EMP pulse only modifies bombs with fuse > 0.1s. Disarmed bombs refund player bomb capacity slot immediately. |
| 11 | Map Crises | Solar Flare wave strikes while player is behind an indestructible pillar | Raycasting algorithm evaluates line-of-sight from flare origin to player bounding box. If an indestructible pillar (`TILE_WALL`) blocks the ray, damage is 0 and safe shadow visual is rendered. |
| 12 | Map Crises | Solar Flare wave hits active bomb on the board | All armed bombs exposed to direct coronal rays ignite instantly (fuse forced to 0ms), triggering immediate explosion cross-blasts. Encourages tactical placement behind pillar shadows. |
| 13 | Map Crises | Creeping Lava engulfs a dropped rare powerup or relic | Dropped item is incinerated with a sizzling steam particle puff (`💨`). If player is using Magnet powerup, item is drawn toward player before lava reaches it. |
| 14 | Map Crises | Dimensional Rift spawns on a tile currently occupied by the player | Spawn location checks `isOccupiedByEntity(r, c)`. If occupied, rift offset shifts to the nearest unoccupied tile within a 1-tile Chebyshev radius. |
| 15 | Scaling Difficulty | Wave index exceeds 100 in Endless Mode | Movement speed calculation `v(W)` hits soft cap of 2.2x base speed (330 px/s for enemies). Enemy count is hard-capped at 14 to guarantee zero frame drops and prevent pool exhaustion. |
| 16 | Scaling Difficulty | Player score exceeds 999,999,999 in deep Endless runs | Score state uses `BigInt` or 64-bit float safely; HUD formats numbers exceeding 1M using compact notation (`1.25M`, `14.8M`) to prevent layout overflow in glassmorphic HUD pill. |
| 17 | Game Modes | Player defeats boss in Boss Rush while an active bomb is still ticking | Scene transition delays 2.5s until all active bombs finish detonating, ensuring no orphaned explosion hazards persist into the next boss arena. |
| 18 | Game Modes | Player collects emergency drop pod in Crisis Survival while inventory is full | Powerup is converted into temporary overshield or bonus score (+500 pts) rather than dropping as dead loot. |
| 19 | Meta-Progression | Player unlocks "Second Wind" perk and takes fatal explosion damage | Player HP clamps to 1 instead of 0; triggers 3.0s golden invulnerability shield, screen flash, and +50% speed burst for 3.0s. "Second Wind" flag marked consumed for the remainder of the run. |
| 20 | Meta-Progression | Browser local storage is cleared or corrupted | Checksum validation detects hash mismatch; initializes clean baseline state with default unlocks and logs warning to console without throwing fatal unhandled exception. |
| 21 | Meta-Progression | Player equips 2 relics with synergistic trigger loops (e.g. Vampiric Confection + Solar Capacitor) | Proc triggers include a 500ms internal cooldown (ICD) guard, preventing infinite recursive trigger feedback loops that would freeze the browser thread. |
| 22 | State Persistence | Browser tab is closed mid-boss fight or during sudden 429 Quota limit | Autosave snapshot stores current boss phase, boss HP, player stats, and inventory. On resume, game offers "Resume Run" prompt restoring exact wave/boss state with 3.0s countdown pause. |

---

## Detailed Architectural & Game Mechanics Specifications

### 1. Multi-Phase Epic Bosses Architecture

#### 1.1 Universal Boss State Machine (`BaseBoss`)
The `BaseBoss` class extends `Phaser.Physics.Arcade.Sprite` and implements the strict FSM:
```
           +------------------+
           |      INTRO       |  <-- Intro Roar / Landing Animation (1.5s)
           +--------+---------+
                    |
                    v
    +------------> IDLE <------------+
    |               |                |
    |               v                |
    |            WINDUP              |  <-- 3-Tier Telegraphing Active
    |               |                |
    |               v                |
    |           ATTACKING            |  <-- Locked Movement Vector
    |          /    |    \           |
    |         v     |     v          |
    |    (Miss)     |   (Bomb Hit)   |
    |       |       |        |       |
    |       v       |        v       |
    |   COOLDOWN    |     STUNNED    |  <-- 2.0s - 4.5s Dizzy Stun Window
    |       |       |        |       |
    |       +-------+        v       |
    |                 INVULNERABLE   |  <-- 1500ms i-Frames (Flashing Alpha)
    |                        |       |
    +------------------------+-------+
                    |
           [HP <= 30% Threshold]
                    v
                 ENRAGED             <-- Audio/Color Shift + Berserk Mechanics
                    |
           [HP <= 0 Threshold]
                    v
                 DEFEATED            <-- Confetti Burst + Key Item Drop
```

#### 1.2 Multi-Bomb Chain Buffer Architecture
To reward tactical mastery without enabling cheese:
1. When a bomb blast strikes a boss in vulnerable state, a `150ms` combo window opens.
2. Subsequent blasts detonating within this 150ms window accumulate into `comboHits`.
3. Total damage dealt equals $\sum \text{damage}$ of all chained blasts.
4. Stun duration scales dynamically:
   $$\text{Stun Duration} = 3.0\text{s} + \min(1.5\text{s}, (\text{comboHits} - 1) \times 0.75\text{s})$$
5. When the 150ms window expires, post-combo i-frames (1500ms) engage, rendering the boss immune to further blasts while stunned.

#### 1.3 Boss Roster Details
1. **King Gummy Bear (👑🐻 Colossus of Gelatin)**:
   - Footprint: 2x2 tiles (80x80 px), 70x70 px capsule collider.
   - HP: 9 Hearts (3 / 3 / 3).
   - Phase 1: March (80 px/s), Royal Leap (1.8s airtime, 2x2 impact, sticky puddles).
   - Phase 2: Speed 115 px/s, Sugar Shockwave (orthogonal 4-way cross), Jelly Budding (2x Gummy Cubs 🐻).
   - Phase 3 (Enraged): Spicy crimson (`#FF1144`), steam puffs, 155 px/s, Triple Bouncing Frenzy, Sugar Ceiling Collapse (4x falling candies 🍬).
   - Tactical Window: Sticky pancake landing provides 2.2s stun; placing bomb on landing tile triggers instant damage and 4.0s stun!
2. **Captain Nibbles (🐹⚙️ Mecha Hamster)**:
   - Footprint: 2x2 tiles (80x80 px), 38px radius circle collider.
   - HP: 10 Hearts (3 / 3 / 4).
   - Phase 1: Kinetic Dash (200 px/s sprint), Bank Shot (90° wall rebound).
   - Phase 2: Speed 260 px/s, 3x rebounds, Electro-Mines (3x floating homing mines), Gyro-Laser 360 Sweep (3.0s full rotation; pillars block laser).
   - Phase 3 (Enraged): Orange-hot hull (`#FF5500`), sirens `🚨`, 320 px/s, Continuous Pinball Mode (6.0s continuous ricochet), Turbine Intake Vacuum.
   - Tactical Window: Cannot brake mid-dash; head-on bomb collision inflicts 1 heart and 3.0s dizzy stun!
3. **Queen Mellifera (🧁🐝 Queen Bee Cupcake)**:
   - Footprint: 2x2 tiles (80x80 px), 36px radius aerial shadow.
   - HP: 12 Hearts (3 / 4 / 5).
   - Phase 1: Aerial cruising (figure-8, 40px altitude, immune to floor flames), 3x Sugar Stinger salvo.
   - Phase 2: Royal Frosting Barrier (4 rotating flower shields), Honey Drizzle carpet (5-tile line), 2x Worker Bees stealing player bombs.
   - Phase 3 (Enraged): Speed +65%, dark chocolate chili frosting, Supersonic Royal Dive (3x3 reticle crash impact), Pollen Cross-Bomb barrage.
   - Tactical Window: Grounded for 3.0s by popping all 4 shields, detonating corner Pollen Launchers, or dodging Phase 3 dive-bomb ("Sugar Coma" in crater for 2.5s).
4. **Void Devourer Avatar (🪐🌀 Singularity)**:
   - Footprint: 2x2 or 3x3 hovering marshmallow singularity at center.
   - HP: 14 Hearts (4 / 5 / 5).
   - Gravitational suction (25 px/s), teleportation between 4 void rifts, cosmic starbursts.
   - Tactical Window: Shield shattered only by Supernova Cleanse via charging Purification Prisms!
5. **Steam Toy Titan (🦾🤖 Clockwork Arch-Inventor)**:
   - Footprint: 2x2 heavy brass automaton.
   - HP: 16 Hearts (5 / 5 / 6).
   - Hydraulic quake stomps, rolling cog saw blades, conveyor belt reversals, flamethrower sweep.
   - Tactical Window: Locked on conduit pads by magnetic arrestors; 4-way simultaneous bomb overload triggers 5.0s short-circuit stun.

---

### 2. Dynamic Stellaris-Style Map Crises

#### 2.1 The 3-Stage Crisis Escalation Paradigm
1. **Stage 1: The Whispers / Herald Buildup (20 Seconds)**:
   - Atmospheric shift: canvas shader tint, ambient soundscape shift, alert banner across top HUD (`⚠️ SITUATION LOG`).
   - Non-lethal grace window: allows player to survey anomaly points, collect nearby loot, and reposition.
2. **Stage 2: The Outbreak & Invader Incursion (50–60 Seconds)**:
   - Physical map hazards manifest (creep spreading, conveyor activation, orbital targeting, solar flare sweeps).
   - Specialized invader units spawn with bomb-countering AI behaviors.
3. **Stage 3: Climax & Resolution Objective (30–40 Seconds)**:
   - Active puzzle or boss battle required to prevent catastrophic failure before countdown expires.

#### 2.2 Comprehensive 6-Crisis Specifications
1. **The Pastel Void Incursion (🌀🌌)**:
   - Stage 1: Violet screen vignette (`#8A2BE2`), reverse music box chimes, 4 void tears at `(3,3)`, `(3,11)`, `(9,3)`, `(9,11)`.
   - Stage 2: Void Creep devours 1 adjacent tile every 8.0s per active rift (converts to Void Tile with 30 px/s suction and 1 dmg/1.5s). Spawns Voidlings (`👾`) and Void Tendrils (`🐙`).
   - Stage 3: Void Devourer Avatar (`🪐`) manifest with Iridescent Sugar Shield.
   - Resolution: Charge 2 Purification Prisms (`💎`) at `(1,13)` and `(11,1)` via 3 adjacent bomb blasts. Active prisms project 3x3 safe auras and reduce global creep speed by 50% each (100% frozen when both active!). At 100% charge, Supernova Cleanse purges creep and drops Avatar shield. Defeat condition: Creep covers >= 65% walkable tiles.
2. **The Clockwork Toy Rebellion (🤖⚙️)**:
   - Stage 1: Metronome audio accelerates 60->120 BPM, translucent rotating brass cogs overlay, laser scanlines.
   - Stage 2: 8 soft blocks harden into Reinforced Brass Cogs (`🔩`). Row 6 and Col 7 become 80 px/s conveyor belts. Periodic EMP pulses (50% instant detonation, 50% dud delay). Spawns Windup Soldiers (`🤖`, snip fuses) and Sentry Turrets (`⚙️`).
   - Stage 3: Steam Toy Titan (`🦾`) spawns. Overdrive Capacitors grant player +3 temporary bomb slots.
   - Resolution: Execute synchronized 4-bomb chain reaction across all 4 Dynamo conduits around `(6,7)` within a 1.5s window. Magnetic arrestors prevent bombs sliding off conduits. Defeat condition: Stopwatch reaches 00:00.
3. **Orbital Bombardment / Meteor Cataclysm (☄️🚀)**:
   - Stage 1: Sweeping red laser reticles, telemetry beeps, Situation Log warning `🛰️ ORBITAL DREADNOUGHT SIGHTED`.
   - Stage 2: Kinetic slugs drop in patterned waves (carpet sweeps, cross volleys) with 1.5s ground reticles. Impacts pulverize blocks, leave craters, and deal 1 heart damage.
   - Stage 3: Spinal Macrocannon particle lance charges across central 3x3 sector.
   - Resolution: Detonate bombs on 3 corner Uplink terminals to activate planetary defense shields and call counter-orbital EMP barrage.
4. **Solar Flares / Coronal Storm (☀️🔥)**:
   - Stage 1: Ambient golden-amber glow, heat distortion ripple shader, HUD magnetic static.
   - Stage 2: Coronal Mass Ejection waves sweep cardinal hallways every 15s. Exposed bombs flash-ignite immediately (0s fuse). Exposed players take 1 heart damage. Safe behind indestructible pillars (`TILE_WALL`).
   - Stage 3: Helios Solar Core manifests at center emitting rotating prominence beams.
   - Resolution: Plant Cryo-Gel Bombs or route coolant into 4 thermal vents to vent coronal pressure before total atmospheric blowout.
5. **Creeping Lava / Tectonic Mantle Rupture (🌋🔥)**:
   - Stage 1: Low seismic rumble, floor cracks, steam geysers erupting from drains.
   - Stage 2: Molten lava breaches outer corridors, slowly advancing inward 1 row/col every 10s. Lava tiles incinerate blocks, bombs, and dropped items instantly.
   - Stage 3: Central caldera magma eruption launching fireballs.
   - Resolution: Use Ice Bombs or trigger Water Hydrant switches to solidify lava channels into brittle obsidian bridges, reaching and shutting the central pressure release valve.
6. **Dimensional Rifts / Warp Inversion (🌀🪞)**:
   - Stage 1: Reality tearing artifacts, spatial audio phasing, gravity flutter.
   - Stage 2: 3 Subspace Rifts manifest. Walking into North edge wraps to South (toroidal corridor wrapping). Mirror duplicate phantoms mimic player bomb drops.
   - Stage 3: Dimensional Singularity Spires emerge at rift loci.
   - Resolution: Close all 3 spires within 2.0s using color-polarized bomb blasts (Quantum Synchronization) before spatial collapse.

---

### 3. Infinite Scaling Difficulty & Endless Mode

#### 3.1 Mathematical Scaling Formulations
For Wave $W \in [1, \infty)$:
1. **Enemy Movement Velocity**:
   $$v(W) = v_0 \times \left(1 + \min\left(1.2, 0.035 \times (W - 1)\right)\right)$$
   Soft capped at $2.2 \times v_0$ (max 330 px/s for fastest enemies, 165 px/s for normal enemies).
2. **Enemy Hit Points & Shielding**:
   $$HP(W) = \lfloor HP_0 + 0.25 \times (W - 1) \rfloor$$
   Starting at Wave 5, 20% of enemies spawn with Reinforced Armor (+1 extra bomb hit required).
3. **Active Enemy Density**:
   $$N(W) = \min\left(14, 4 + \lfloor \sqrt{W - 1} \times 1.5 \rfloor\right)$$
   Strictly capped at 14 concurrent active enemies to ensure zero GC and flawless 60 FPS.
4. **Bomb Fuse & Reaction Thresholds**:
   $$\text{Fuse}(W) = \max\left(1200\text{ ms}, 2000\text{ ms} - 40\text{ ms} \times (W - 1)\right)$$
   Enemy reaction time for bomb evasion drops from 600ms to 200ms at Wave 20+.
5. **Score Multiplier**:
   $$M(W) = 1.0 + 0.15 \times (W - 1) + 0.05 \times \text{KillStreak}$$

#### 3.2 Dynamic Wave Room Mutators (Affixes)
Every wave draws 1-2 random mutators from the Affix pool:
- **Speed Demon**: Entities move +25% faster; bomb fuses burn 25% faster.
- **Volatile Conduits**: Bomb blast radius +2 tiles; chain reaction delay reduced to 0ms.
- **Dense Fortification**: 80% soft block coverage; all soft blocks require 2 bomb hits.
- **Glass Cannon**: Player deals double bomb damage; player shield buffer disabled.
- **Magnetic Drift**: Placed bombs slowly glide toward nearest moving entity at 20 px/s.
- **Solar Corona**: Coronal light sweeps flash across corridors every 20s.
- **Zero-G Fizz**: Inertia glide active; kicked bombs bounce off walls twice.

---

### 4. New Game Modes

#### 4.1 Crisis Survival Mode
- **Objective**: Survive as long as possible against escalating Stellaris-style crises.
- **Timer**: Survival stopwatch counts UP (`00:00 -> 99:59`).
- **Cadence**: A new Crisis strikes every 60 seconds.
- **Drop Pods**: Every 45s, a planetary emergency canister drops containing hearts, shields, and temporary gear upgrades.
- **Scoring**: Final Rank based on Total Survival Time and Crises Purified.

#### 4.2 Boss Rush Mode
- **Objective**: Defeat all 5 Epic Bosses back-to-back in the shortest time.
- **Sequence**: King Gummy Bear -> Captain Nibbles -> Queen Mellifera -> Steam Toy Titan -> Void Devourer Avatar.
- **Rest Stops**: 20-second breather between bosses with Madame Bonbon offering shop buffs and shield repairs.
- **Persistent Health**: Damage taken carries over into subsequent boss fights.
- **Medal Tiers**: Platinum (sub-5 min), Gold (sub-7 min), Silver (sub-10 min), Bronze (completion).

#### 4.3 Endless Gauntlet Mode
- **Objective**: Advance through infinite procedurally generated chambers.
- **Room Taxonomy**:
  - *Standard Chamber (60%)*: Clear all enemies to unlock exit portal.
  - *Elite Chamber (15%)*: High-density armored enemies with guaranteed Gilded Chest drops.
  - *Crisis Chamber (15%)*: Full map crisis event must be resolved to unlock exit.
  - *Boss Arena (10%)*: Epic boss encounter every 5th chamber (Chambers 5, 10, 15, 20...).
- **Boon Draft**: Upon clearing each chamber, player selects 1 of 3 temporary boon perks.
- **Checkpoints**: Elevator shortcuts unlock at Chambers 10, 20, 30.

---

### 5. Meta-Progression & Progression Systems

#### 5.1 Dual-Currency Economy
1. **Star Candies (🍬)**: In-run currency gained from destroying blocks, defeating enemies, and coin drops. Used at Madame Bonbon's stall during runs.
2. **Cosmic Sugar Essence (✨)**: Permanent meta-currency awarded upon boss defeat (+10 to +25 ✨), crisis resolution (+15 ✨), or room milestones (+2 ✨). Never lost on game over.

#### 5.2 Hub Confectionery Perk Tree (16 Upgrades)
- **Baking Mastery**:
  - *Sugar Spark (1-3)*: Starting blast radius +1 to +3.
  - *Quick Wick (1-3)*: Bomb cooldown reduced by 10% to 25%.
  - *Chain Reaction (1-2)*: Bomb chain combo bonuses (+25% score, +5% ult charge).
  - *Master Confectioner (1)*: Max bomb capacity increased to 9.
- **Sugar Rush (Mobility)**:
  - *Bouncy Soles (1-3)*: Base movement speed +10 to +30 px/s.
  - *Corner Magnet (1-2)*: Corner-sliding tolerance expanded from 8px to 14px.
  - *Dash Decoy (1)*: Dash leaves a lingering confection decoy that draws enemy aggro for 1.5s.
  - *Hyper-Sprint (1)*: Dash cooldown reduced by 1.0s, +20% speed burst post-dash.
- **Resilience (Defense)**:
  - *Sugar Coating (1-2)*: Start every run with 1 to 2 Bubble Shields.
  - *Second Wind (1)*: Once per run, survive fatal damage with 1 HP and 3.0s invincibility.
  - *Hazard Buffer (1-2)*: Ground slowdown (honey/puddles) reduced by 50% to 80%.
  - *Titan Heart (1)*: Permanent extra Max Heart container (4 Hearts total).
- **Alchemy & Luck (Utility)**:
  - *Sweet Tooth (1-3)*: Item drop rate increased by +5% to +15%.
  - *Merchant Discount (1-2)*: Madame Bonbon shop prices reduced by 15% to 30%.
  - *Relic Resonance (1-2)*: Increases relic drop chance and unlocks 2nd relic slot.
  - *Golden Touch (1)*: 5% chance breakable blocks turn into Gilded Chests.

#### 5.3 Equippable Relics (8 Artifacts)
1. **Pocket Chronometer**: Slows enemy speed by 20% during the final 30 seconds of any match/crisis timer.
2. **Gelatinous Core**: Bouncing off walls knocks back adjacent enemies and stuns them for 0.5s.
3. **Pyroclastic Prism**: Bomb explosions produce 4 diagonal spark shards that travel 2 tiles.
4. **Magnetron Dial**: Dropped items within 4 tiles are magnetically drawn to the player.
5. **Vampiric Confection**: Defeating 5 enemies without taking damage restores 1 shield charge.
6. **Solar Capacitor**: Standing in open corridors charges a temporary radiant overshield over 8s.
7. **Void Singularity Lens**: Remote bombs create a mini-vortex pulling nearby enemies 1 tile inward before detonation.
8. **Clockwork Spring**: Kicking a bomb accelerates its sliding speed to 450 px/s and pierces through 1 soft block.

#### 5.4 State Persistence Schema (`GameSaveState`)
```typescript
export interface GameSaveState {
  version: number;               // Migration version (e.g. 1)
  timestamp: number;             // Save time (UTC ms)
  checksum: string;              // SHA-256 or Murmur3 integrity hash
  meta: {
    cosmicEssence: number;       // Persistent currency balance
    trophiesUnlocked: string[];  // Unlocked achievement IDs
    perks: Record<string, number>; // Perk ID -> Current Level
    unlockedModes: string[];     // ['STORY', 'SURVIVAL', 'BOSSRUSH', 'ENDLESS']
    selectedSkin: string;        // Player cosmetic sprite ID
    selectedBombPalette: string; // Bomb visual theme
  };
  activeRun?: {
    mode: 'STORY' | 'SURVIVAL' | 'BOSSRUSH' | 'ENDLESS';
    currentWave: number;
    score: number;
    health: number;
    maxHealth: number;
    equippedRelics: string[];
    playerStats: PlayerStats;
    bossState?: {
      bossId: string;
      currentHp: number;
      phase: number;
    };
    crisisState?: {
      crisisId: string;
      stage: number;
      progress: number;
    };
  };
}
```

---

## Technical Constraints & Quality Standards Verification

1. **Zero External Assets (Mandatory)**:
   - All visual elements: Procedural HTML5 Canvas 2D primitives (`roundRect`, `createRadialGradient`, `setLineDash`) and Unicode Emojis (`👑`, `🐻`, `🐹`, `⚙️`, `🧁`, `🐝`, `🪐`, `🌀`, `☄️`, `☀️`, `🌋`).
   - All audio: Synthesized on-the-fly via Web Audio API oscillators, biquad filters, and noise buffers.
2. **Zero-GC & Memory Pooling**:
   - Particle pool: 120 pre-allocated objects (`p.active = false` recycling).
   - Projectile pool: 32 pre-allocated hazard objects.
   - Blast ray arrays: Pre-allocated statically sized coordinate buffers to eliminate array allocations in the 60 FPS update loop.
3. **10,000-Frame Soak Stability**:
   - Memory profile verified leak-free over 10k frames under continuous chaos bot bomb/dash spam.
4. **Accessibility (WCAG AAA)**:
   - Dark Chocolate outline (`#4A2E2B`) on all text ensures >= 7.4:1 contrast.
   - Dual-channel hazard indicators (color + diagonal textured hatching) guarantee colorblind usability.
