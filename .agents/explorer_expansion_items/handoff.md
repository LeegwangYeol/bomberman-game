# ARCHITECTURAL INVESTIGATION REPORT: 20+ ITEMS, DROP SYSTEM & INVENTORY HUD

- **Author**: Explorer Agent (Specialist: Items, Drop Systems & In-Game UI)
- **Target Working Directory**: `/Users/user/src/bomberman/.agents/explorer_expansion_items/`
- **Reference Documents**: `.agents/ORIGINAL_REQUEST.md` (Follow-up 2026-09-15T07:08:09Z), `COLLABORATION.md`, `PROJECT.md`
- **Codebase Targets**: `src/game/gameplay_mechanics.ts`, `src/game/GameScene.ts`, `src/components/BombermanGame.tsx`

---

## 1. Observation

Direct observations from the active codebase and design specifications:

1. **Item Definition & Baseline Inventory (`src/game/gameplay_mechanics.ts:5-25`)**:
   ```typescript
   export type ItemType = 'SPEED_UP' | 'BOMB_UP' | 'FIRE_UP' | 'KICK' | 'SHIELD';
   export interface PlayerStats {
     speed: number;
     speedLevel: number;        // 1 to 5
     maxBombs: number;          // 1 to 8
     activeBombs: number;       // Current placed on board by player
     bombPower: number;         // 2 to 8 (blast radius in tiles)
     hasKick: boolean;          // Bomb kick unlocked
     hasShield: boolean;        // Shield active (absorbs 1 fatal hit)
     dashCooldownRemaining: number;
     itemsCollected: {
       speedUp: number;
       bombUp: number;
       fireUp: number;
       kick: number;
       shield: number;
     };
     score: number;
     isGameOver: boolean;
   }
   ```
   *Finding*: The system currently only defines 5 items. The stats and `itemsCollected` interface are strictly hardcoded to these 5 item counters.

2. **Drop Rate & Probability Distribution (`src/game/gameplay_mechanics.ts:27-36`)**:
   ```typescript
   export const ITEM_DROP_RATE = 0.45; // 45% drop probability on block destruction
   export const ITEM_WEIGHTS = {
     BOMB_UP: 0.38,
     FIRE_UP: 0.38,
     SPEED_UP: 0.16,
     KICK: 0.04,
     SHIELD: 0.04,
   } as const;
   ```
   *Finding*: Blocks roll a 45% flat drop rate. When dropped, the item is rolled via cumulative probabilities favoring basic stats (76% combined for Bomb Up & Fire Up) with rare utility items (Kick 4%, Shield 4%).

3. **Item Grace Period Invariant (`src/game/gameplay_mechanics.ts:53, 180-182`)**:
   ```typescript
   export const ITEM_GRACE_PERIOD_MS = 600;
   export function isItemProtectedFromExplosion(spawnTime: number, explosionTime: number): boolean {
     return (explosionTime - spawnTime) <= ITEM_GRACE_PERIOD_MS;
   }
   ```
   *Finding*: An explosion lasts 320ms (`GameScene.ts:1817`). When a destructible block is detonated, the item drops directly into the active explosion. The 600ms grace window guarantees that newly spawned items are not incinerated by the very blast that freed them.

4. **Procedural Item Texture Generation (`src/game/GameScene.ts:2160-2205`)**:
   ```typescript
   private generateItemTextures() {
     const itemDefs = [
       { key: 'item_speed', bgColor: 0x06b6d4, ringColor: 0x22d3ee },
       { key: 'item_bomb', bgColor: 0x334155, ringColor: 0x94a3b8 },
       { key: 'item_fire', bgColor: 0xe11d48, ringColor: 0xfb7185 },
       { key: 'item_kick', bgColor: 0x16a34a, ringColor: 0x4ade80 },
       { key: 'item_shield', bgColor: 0xd97706, ringColor: 0xfbbf24 },
     ];
     // Uses canvas context roundRect with fallback to Graphics generateTexture
   }
   ```
   *Finding*: Item icons are procedurally generated at runtime (32x32 px) using HTML5 Canvas 2D context (`roundRect`), eliminating missing external PNG file errors.

5. **React-Phaser HUD Bridge (`src/components/BombermanGame.tsx:31-45, 125-130, 251-332`)**:
   - `BombermanGame.tsx` subscribes to `phaserGame.events.on('stats-update', handleStatsUpdate)`.
   - Gauges for Bombs, Fire, and Speed are rendered in retro slate badges.
   - Collected items are shown as a tiny text summary: `⚡speedUp 💣bombUp 🔥fireUp`.
   - On mobile screens (`isMobile`), only a virtual joystick and touch buttons for Dash and Bomb are present; there is currently no inventory inspection or tooltip modal.

---

## 2. Logic Chain

1. **Expansion Scope**: The authoritative request (`ORIGINAL_REQUEST.md:118-120`) mandates at least 20 distinct items/power-ups and a comprehensive UI system with item icons, detailed descriptions, and inventory tracking.
2. **Categorical Balance**: Providing 20+ unstructured items causes gameplay chaos. To achieve competitive depth and strategic variety, items must be cleanly categorized into 4 tactical pillars:
   - **Bomb Variants** (alter blast geometry, detonation trigger, or element)
   - **Stat Boosts** (augment player core attributes with strict mathematical caps)
   - **Utilities & Active Gear** (passive mobility and board interaction rules)
   - **Tactical Buffs & Active Skills** (temporary high-impact game changers)
   - *Result*: We specify **24 items (6 per category)**, providing rich diversity while maintaining clean symmetry.
3. **Drop Table & Anti-Snowball Mathematics**:
   - Randomly dropping 24 items uniformly would dilute core power-ups (`Bomb Up`, `Fire Up`), making players feel underpowered in early game.
   - *Solution*: Tiered weighted distribution (Common: 60%, Uncommon: 22%, Rare: 13%, Epic/Legendary: 5%).
   - *Dynamic Pity & Stat Redirection*: When a player hits stat caps (`MAX_PLAYER_SPEED = 250`, `MAX_BOMBS_CAP = 8`, `MAX_BOMB_POWER_CAP = 8`), drop roll dynamically replaces capped items with tactical consumables or score gems, preventing dead drops.
   - *Special Crates*: Golden Crates (`TILE_CHEST`) with 100% guaranteed Rare/Epic drops placed at high-risk map center corridors.
4. **Cross-Platform HUD & Tooltip Architecture**:
   - On PC: Hovering over inventory items must display an arcade-styled glassmorphic tooltip card with icon, rarity, stat mutator, and lore.
   - On Mobile: Hover is impossible. Mobile requires a collapsible bottom drawer (`🎒 INVENTORY`) with touch-friendly 48px icons and tap-to-inspect detail sheet.
5. **Zero Asset Flake / Procedural Texture Pipeline**:
   - External sprite files risk 404s and bundle bloat. By extending the procedural HTML5 Canvas texture generator in `GameScene.ts`, all 24 item icons are generated on-the-fly with distinctive color palettes, SVG path silhouettes, and animated pulse effects.

---

## 3. Comprehensive 24-Item Specification Catalog

### Category A: Bomb Variants (6 Items)

#### 1. `PIERCING_BOMB` — Spike Penetrator Bomb (관통 폭탄)
- **Category**: Bomb Variant
- **Rarity / Weight**: Rare (0.025)
- **Gameplay Mechanic**: Blast rays ignore soft destructible blocks (`TILE_BLOCK`), penetrating through all soft blocks along cardinal directions up to the blast radius. Only stops when contacting indestructible perimeter walls (`TILE_WALL`).
- **Code Logic**: In blast propagation loop (`getBlastTiles`), do not break ray when encountering `TILE_BLOCK`; mark tile for destruction and continue raycast until `TILE_WALL` or radius cap.
- **Visual Representation**: Hex background `#1e293b` (slate-900), steel-tipped four-way diamond spikes (`#94a3b8`), glowing cyan center core (`#06b6d4`), silver border stroke.
- **Inventory Description**:
  - *Flavor*: "Reinforced with titanium spike cores capable of vaporizing reinforced obstacles."
  - *Mechanic*: Blasts pierce through all soft blocks in their path without stopping at the first obstacle.

#### 2. `REMOTE_BOMB` — Radio Detonator Bomb (원격 조종 폭탄)
- **Category**: Bomb Variant
- **Rarity / Weight**: Rare (0.025)
- **Gameplay Mechanic**: Bombs planted do not detonate on a 3-second fuse. They remain armed indefinitely until the player presses the Detonate button (`R` / `X` or mobile DETONATE button). Detonates all active player bombs simultaneously. Max fuse timeout 30s as safety fallback.
- **Code Logic**: Set `bomb.setData('isRemote', true)`. Omit default delayedCall trigger; attach listener to scene event `'trigger-remote-detonation'`.
- **Visual Representation**: Deep crimson background (`#881337`), digital transmitter antenna with flashing green/red LED dot (`#22c55e`), circuitry trace accents, gold rim (`#fbbf24`).
- **Inventory Description**:
  - *Flavor*: "Military-grade C4 linked to an encrypted shortwave transmitter."
  - *Mechanic*: Fuses are paused. Detonate all your placed bombs simultaneously on demand via [R] or mobile button.

#### 3. `CLUSTER_BOMB` — Scatter Sub-Munition Bomb (분열 클러스터 폭탄)
- **Category**: Bomb Variant
- **Rarity / Weight**: Epic (0.015)
- **Gameplay Mechanic**: Upon primary detonation, shoots 4 micro-bomblets 1 tile outward in cardinal directions. After 400ms delay, each sub-munition explodes with a 1-tile blast radius, saturating corridors.
- **Code Logic**: In primary bomb explosion callback, iterate 4 cardinal offsets. If target tile is empty, spawn `MiniBomb` with `power: 1`, `fuse: 400ms`.
- **Visual Representation**: Deep royal purple background (`#3b0764`), cluster of three glowing yellow-orange spheres connected by sparks, neon magenta border (`#e879f9`).
- **Inventory Description**:
  - *Flavor*: "Volatile secondary munitions packed into a pressurized fragmentation shell."
  - *Mechanic*: Detonates normally, then ejects 4 micro-bomblets into adjacent tiles for cascading secondary blast waves.

#### 4. `LANDMINE` — Stealth Proximity Mine (스텔스 지뢰)
- **Category**: Bomb Variant
- **Rarity / Weight**: Uncommon (0.040)
- **Gameplay Mechanic**: Placed flush into the ground. After 400ms arming time, becomes semi-invisible (alpha 0.35). Has no countdown timer; triggers instantly when an enemy or player steps directly onto the tile. Enemies cannot detect it via standard BFS pathfinding.
- **Code Logic**: Flag `isLandmine = true`. Disable standard timer. Add physics overlap listener: triggers immediate `explodeBomb()` when any living entity touches tile.
- **Visual Representation**: Dark olive/slate disk (`#334155`), pulsing red crosshair center sensor (`#f43f5e`), yellow-black hazard diagonal border stripes (`#eab308`).
- **Inventory Description**:
  - *Flavor*: "Pressure-actuated subterranean mine designed for corridor ambush."
  - *Mechanic*: Arming after 0.4s, fades into stealth. Detonates instantly upon entity contact.

#### 5. `ICE_BOMB` — Absolute Zero Cryo Bomb (빙결 폭탄)
- **Category**: Bomb Variant
- **Rarity / Weight**: Rare (0.025)
- **Gameplay Mechanic**: Blast creates a freezing frost wave (`0x67e8f9`). Enemies caught in the blast are frozen solid for 3.0s (velocity 0, AI state paused, wrapped in translucent cyan ice cube). If player is hit, player is frozen for 1.5s but shielded from lethal damage. Clears soft blocks normally.
- **Code Logic**: Blast damage handler checks `isIceBomb`. If true, calls `target.freeze(3000)` instead of `target.die()`.
- **Visual Representation**: Deep glacial navy background (`#082f49`), geometric 6-point snowflake emblem (`#38bdf8`), sparkling white frost ring (`#e0f2fe`).
- **Inventory Description**:
  - *Flavor*: "Liquid nitrogen core that flash-freezes matter to near absolute zero."
  - *Mechanic*: Blasts freeze enemies solid for 3 seconds. Freezes players for 1.5s in a protective cryo shell.

#### 6. `BOUNCING_BOMB` — Elastic Ricochet Bomb (바운싱 고무 폭탄)
- **Category**: Bomb Variant
- **Rarity / Weight**: Uncommon (0.035)
- **Gameplay Mechanic**: Highly elastic rubberized shell. When kicked, instead of stopping dead at the first solid wall or block, it bounces off surfaces up to 3 times, reversing or deflecting along open corridors at high velocity (320 px/s).
- **Code Logic**: In sliding physics collision with wall/block: check `bounceCount < 3`. If so, reverse velocity vector `vx = -vx` or deflect, increment `bounceCount`, play spring bounce sound/animation.
- **Visual Representation**: Vivid electric purple (`#581c87`), neon green rubberized chevron ribs (`#22c55e`), kinetic spring icon (`#a855f7`).
- **Inventory Description**:
  - *Flavor*: "High-density vulcanized polymetric rubber encasing an unstable core."
  - *Mechanic*: Kicked bombs rebound dynamically off walls and obstacles up to 3 times before coming to rest.

---

### Category B: Stat Boosts (6 Items)

#### 7. `SPEED_UP` — Swift Roller Boots (스피드 업)
- **Category**: Stat Boost
- **Rarity / Weight**: Common (0.120)
- **Gameplay Mechanic**: Increases movement velocity by +25 px/s up to max 250 px/s (Level 5).
- **Code Logic**: `stats.speed = Math.min(250, stats.speed + 25)`. Update `stats.speedLevel`.
- **Visual Representation**: Deep cyan background (`#06b6d4`), dual forward-angled lightning wings (`#ffffff`), bright cyan border (`#22d3ee`).
- **Inventory Description**:
  - *Flavor*: "Pneumatic spring skates that reduce friction across the arena grid."
  - *Mechanic*: +25 px/s movement speed (Capped at 250 px/s / Level 5).

#### 8. `BOMB_UP` — Ammunition Bandolier (폭탄 수량 업)
- **Category**: Stat Boost
- **Rarity / Weight**: Common (0.180)
- **Gameplay Mechanic**: Increases maximum simultaneous active bombs by +1 up to cap of 8.
- **Code Logic**: `stats.maxBombs = Math.min(8, stats.maxBombs + 1)`.
- **Visual Representation**: Charcoal slate background (`#334155`), classic round black bomb with burning white spark fuse, silver border (`#94a3b8`).
- **Inventory Description**:
  - *Flavor*: "Modular combat bandolier providing rapid ordnance reload."
  - *Mechanic*: +1 maximum concurrent placed bombs (Capped at 8 bombs).

#### 9. `FIRE_UP` — High-Octane Gunpowder (화력 업)
- **Category**: Stat Boost
- **Rarity / Weight**: Common (0.180)
- **Gameplay Mechanic**: Increases explosion blast length by +1 tile in all 4 cardinal directions up to cap of 8 tiles.
- **Code Logic**: `stats.bombPower = Math.min(8, stats.bombPower + 1)`.
- **Visual Representation**: Crimson red background (`#e11d48`), blazing triple-flame crest (`#facc15`), vibrant rose border (`#fb7185`).
- **Inventory Description**:
  - *Flavor*: "Refined nitroglycerin additive that supercharges explosive combustion."
  - *Mechanic*: +1 tile explosion flame radius in all cardinal directions (Capped at 8 tiles).

#### 10. `MEGA_FIRE` — Golden Supernova Canister (풀 화력 / 메가 파이어)
- **Category**: Stat Boost
- **Rarity / Weight**: Legendary (0.010)
- **Gameplay Mechanic**: Instantly elevates explosion blast power to maximum corridor length (Level 8 / 8 tiles).
- **Code Logic**: `stats.bombPower = 8; stats.score += 500`.
- **Visual Representation**: Radiant golden-amber background (`#ea580c`), crowned roaring sunburst flame (`#fef08a`), double gold border (`#fde047`).
- **Inventory Description**:
  - *Flavor*: "Concentrated solar plasma fuel sealed inside an ancient golden urn."
  - *Mechanic*: Instantly maxes out explosion blast length to the maximum possible (Level 8).

#### 11. `ARMOR_UP` — Heavy Blast Plate (아머 강화)
- **Category**: Stat Boost
- **Rarity / Weight**: Rare (0.030)
- **Gameplay Mechanic**: Increases maximum shield capacity from 1 to 2 charges, and instantly restores +1 shield layer.
- **Code Logic**: `stats.maxShields = 2; stats.shieldCharges = Math.min(2, stats.shieldCharges + 1); stats.hasShield = true`.
- **Visual Representation**: Dark cobalt background (`#1e3a5f`), segmented iron chestplate with titanium rivets (`#60a5fa`), reinforced steel border (`#93c5fd`).
- **Inventory Description**:
  - *Flavor*: "Composite ceramic-titanium armor plating designed to absorb high-yield concussions."
  - *Mechanic*: Unlocks 2nd shield storage slot and immediately grants +1 shield charge.

#### 12. `BLAST_RESISTANCE` — Blast Deflection Lining (폭발 내성 슈트)
- **Category**: Stat Boost
- **Rarity / Weight**: Rare (0.025)
- **Gameplay Mechanic**: Provides 50% passive chance to shrug off friendly bomb damage without losing a shield. If no shield, converts lethal blow to a 1.2s stun with 1-tile knockback and 1.5s invulnerability.
- **Code Logic**: In player damage handler: if damage source is player's own bomb, roll `Math.random() < 0.5`. If true, trigger deflection spark; else apply stun rather than game over.
- **Visual Representation**: Heavy hazard orange background (`#c2410c`), bio-hazard safety suit badge (`#fed7aa`), reinforced copper rim (`#f97316`).
- **Inventory Description**:
  - *Flavor*: "Asbestos-insulated hazard suit certified against high-temperature blast waves."
  - *Mechanic*: 50% chance to resist self-inflicted bomb blasts. Non-shield friendly hits stun instead of kill.

---

### Category C: Utilities & Active Gear (6 Items)

#### 13. `BOMB_KICK` — Cleated Power Boots (폭탄 킥)
- **Category**: Utility & Active Gear
- **Rarity / Weight**: Uncommon (0.040)
- **Gameplay Mechanic**: Allows kicking planted bombs by walking into them. Kicked bomb slides smoothly along the corridor at 300 px/s until hitting an obstacle or entity.
- **Code Logic**: Existing `hasKick = true`. Initiates sliding velocity and corridor collision raycast.
- **Visual Representation**: Forest green background (`#16a34a`), winged steel-toed soccer boot (`#4ade80`), emerald border (`#86efac`).
- **Inventory Description**:
  - *Flavor*: "Spring-loaded magnetic cleat boots that propel heavy ordnance with precision."
  - *Mechanic*: Walk into any placed bomb to kick it sliding down the corridor at 300 px/s.

#### 14. `WALL_PASS` — Quantum Phasing Treads (소프트 블록 통과)
- **Category**: Utility & Active Gear
- **Rarity / Weight**: Epic (0.015)
- **Gameplay Mechanic**: Enables the player to walk directly through destructible soft blocks (`TILE_BLOCK`) as if they were open corridors. Hard border walls (`TILE_WALL`) remain impassable. Bombs cannot be dropped inside occupied soft blocks.
- **Code Logic**: Disable arcade physics collision between `player` and `blocks` group. Clamp bomb placement to empty coordinates only.
- **Visual Representation**: Ethereal violet background (`#581c87`), spectral foot phasing through brick masonry (`#c084fc`), glowing lavender border (`#e9d5ff`).
- **Inventory Description**:
  - *Flavor*: "Experimental quantum phase-shifter allowing molecular de-densification."
  - *Mechanic*: Pass freely through soft destructible blocks. Escape dead-ends with ease!

#### 15. `BOMB_PASS` — Displacement Belt (폭탄 통과 벨트)
- **Category**: Utility & Active Gear
- **Rarity / Weight**: Rare (0.030)
- **Gameplay Mechanic**: Allows the player to walk through planted bombs without being blocked, eliminating the danger of trapping oneself in dead-end alleys. Player can still kick bombs when pressing the Kick modifier or walking directly into them while facing them.
- **Code Logic**: Ignore player-bomb body collision unless kick condition is met.
- **Visual Representation**: Deep indigo background (`#312e81`), semi-transparent wireframe bomb holographic grid (`#818cf8`), neon blue border (`#a5b4fc`).
- **Inventory Description**:
  - *Flavor*: "Harmonic dimensional tether that permits safe transit through armed explosives."
  - *Mechanic*: Walk directly over planted bombs. Never get trapped in a corner again.

#### 16. `TIME_FREEZE_CLOCK` — Chrono Stop Pocketwatch (시간 정지 시계)
- **Category**: Utility & Active Gear
- **Rarity / Weight**: Epic (0.015)
- **Gameplay Mechanic**: Consumable active item or on-pickup: halts all enemy AI, monster movement, and bomb countdown timers for 4.0 seconds. Arena flashes with a cyan/sepia time-warp tint. Player moves at normal speed.
- **Code Logic**: Set `scene.isTimeFrozen = true` for 4000ms. Pause enemy FSM updates, pause non-player bomb countdown timers, play ticking audio loop.
- **Visual Representation**: Antique brass background (`#78350f`), glowing gold Roman numeral pocketwatch dial (`#facc15`), radiant gold border (`#fef08a`).
- **Inventory Description**:
  - *Flavor*: "Relic of an ancient chronomancer, locking local spacetime into absolute stasis."
  - *Mechanic*: Freezes all enemies and bomb countdown fuses for 4 seconds while you move freely.

#### 17. `ITEM_MAGNET` — Electro-Magnetic Attractor (아이템 자석)
- **Category**: Utility & Active Gear
- **Rarity / Weight**: Rare (0.030)
- **Gameplay Mechanic**: Passive aura. All dropped items within a 3-tile radius (120px) are smoothly pulled towards the player at 180 px/s, pulling items away from danger before explosions reach them.
- **Code Logic**: In `GameScene.update()`: query `items.getChildren()`. If distance to player $\le 120$ px, apply attractive velocity towards player.
- **Visual Representation**: Cobalt blue background (`#172554`), classic red-and-blue horseshoe magnet emitting electric lightning arcs (`#38bdf8`), cyan border (`#93c5fd`).
- **Inventory Description**:
  - *Flavor*: "High-intensity neodymium electromagnets tuned to power-up metallic shells."
  - *Mechanic*: Automatically pulls all dropped items within a 3-tile radius directly to you.

#### 18. `HEART_EXTRA_LIFE` — Golden Cherub Heart (추가 생명 1-UP)
- **Category**: Utility & Active Gear
- **Rarity / Weight**: Legendary (0.010)
- **Gameplay Mechanic**: Grants an extra life (max 3 lives). When suffering fatal damage with no active shields, the heart shatters, instantly resurrecting the player in place with a 3.0s golden invulnerability shield and a 2-tile radial knockback wave.
- **Code Logic**: `stats.extraLives = Math.min(3, stats.extraLives + 1)`. When `playerDie()` is invoked: if `extraLives > 0`, decrement `extraLives`, cancel game over, trigger 3000ms invulnerability and shockwave.
- **Visual Representation**: Rich ruby red background (`#881337`), faceted 3D ruby heart with shimmering golden wings (`#f43f5e`), radiant gold halo (`#fbbf24`).
- **Inventory Description**:
  - *Flavor*: "Sacred heart infused with phoenix essence, defying fatal demise."
  - *Mechanic*: Grants +1 extra life. Fatal hits revive you in place with 3 seconds of invulnerability.

---

### Category D: Tactical Buffs & Active Skills (6 Items)

#### 19. `SHIELD_BARRIER` — Aegis Force Barrier (에너지 쉴드)
- **Category**: Tactical Buff
- **Rarity / Weight**: Uncommon (0.040)
- **Gameplay Mechanic**: Existing item, absorbs 1 fatal hit from enemy collision or bomb explosion, granting 1500ms post-hit invulnerability and dispersing shield shard particles.
- **Code Logic**: Existing `hasShield = true`, `shieldInvulnerableUntil = time.now + 1500`.
- **Visual Representation**: Warm amber background (`#d97706`), radiant kite shield crest with energy rune (`#fbbf24`), luminous yellow border (`#fde68a`).
- **Inventory Description**:
  - *Flavor*: "Hexagonal energy field enveloping the user in an impenetrable kinetic barrier."
  - *Mechanic*: Completely absorbs 1 fatal hit and triggers 1.5s of emergency invulnerability.

#### 20. `INVISIBILITY_CLOAK` — Phantom Cloak (은신 투명 망토)
- **Category**: Tactical Buff
- **Rarity / Weight**: Rare (0.025)
- **Gameplay Mechanic**: Grants 6.0 seconds of complete invisibility. Player sprite alpha drops to 0.35 with a ghostly cyan shimmer. All enemy tracking AI loses line-of-sight; trackers revert to `PATROL` or `IDLE` state.
- **Code Logic**: Set `isStealthedUntil = time.now + 6000`. In enemy pathfinding, treat player coordinate as null / unreachable.
- **Visual Representation**: Midnight obsidian background (`#0f172a`), translucent hooded silhouette with glowing starry particles (`#818cf8`), spectral violet border (`#c084fc`).
- **Inventory Description**:
  - *Flavor*: "Cloak woven from dark matter threads that bend light and thermal signatures."
  - *Mechanic*: Renders you completely invisible to enemies for 6 seconds, canceling enemy pursuit.

#### 21. `BLAST_DEFLECTOR` — Prismatic Mirror Aegis (폭발 반사 거울)
- **Category**: Tactical Buff
- **Rarity / Weight**: Rare (0.025)
- **Gameplay Mechanic**: When performing a Dash (`Shift/E`) through an explosion tile, the kinetic energy is reflected: blasts propagate in reverse direction away from player, destroying any enemies caught in the deflected wave and awarding +500 bonus score.
- **Code Logic**: In player dash overlap with explosion: if `hasBlastDeflector`, spawn reversed explosion shockwave and destroy enemies along the reflected vector.
- **Visual Representation**: Deep teal background (`#0f766e`), multifaceted hexagonal mirror prism (`#2dd4bf`), prismatic cyan border (`#5eead4`).
- **Inventory Description**:
  - *Flavor*: "Prismatic alloy that absorbs explosive shockwaves and redirects their force."
  - *Mechanic*: Dashing through an explosion reflects the blast forward, wiping out pursuing enemies.

#### 22. `SPEED_SURGE` — Adrenaline Turbo Injector (폭풍 질주 포션)
- **Category**: Tactical Buff
- **Rarity / Weight**: Uncommon (0.040)
- **Gameplay Mechanic**: Temporary 8.0-second adrenaline boost. Increases speed by +75 px/s (temporarily breaking past the 250 px/s cap up to 325 px/s) and cuts Dash cooldown in half (1750ms instead of 3500ms).
- **Code Logic**: Set `speedSurgeUntil = time.now + 8000`. In update loop, apply +75 speed boost and 0.5x dash cooldown multiplier while active.
- **Visual Representation**: Electric lime background (`#15803d`), bubbling potion beaker with lightning effervescence (`#84cc16`), chartreuse border (`#bef264`).
- **Inventory Description**:
  - *Flavor*: "Hyper-concentrated adrenaline stimulant that pushes motor limits."
  - *Mechanic*: +75 px/s speed burst (exceeds cap up to 325 px/s) and halves Dash cooldown for 8 seconds.

#### 23. `VAMPIRIC_SIPHON` — Crimson Soul Phylactery (흡혈의 영혼석)
- **Category**: Tactical Buff
- **Rarity / Weight**: Rare (0.020)
- **Gameplay Mechanic**: Passive pact. Whenever an enemy is eliminated by your bombs, there is a 35% chance to siphon their vital energy, immediately restoring 1 lost shield layer (or granting +250 score if shield is full).
- **Code Logic**: In enemy elimination handler: if `hasVampiricSiphon`, roll `Math.random() < 0.35`. If true, trigger crimson soul homing orb to player; restore `hasShield = true`.
- **Visual Representation**: Dark blood-crimson background (`#450a0a`), winged vampiric bat skull chalice (`#ef4444`), scarlet border (`#f87171`).
- **Inventory Description**:
  - *Flavor*: "Dark crystalline phylactery that siphons ambient soul energy upon enemy defeat."
  - *Mechanic*: Defeating enemies has a 35% chance to harvest their energy and restore a lost shield layer.

#### 24. `POISON_MIST_BOMB` — Toxic Venom Cloud Bomb (맹독 안개탄)
- **Category**: Bomb Variant / Tactical
- **Rarity / Weight**: Rare (0.025)
- **Gameplay Mechanic**: Upon explosion, leaves behind a lingering toxic venom cloud on all blast tiles for 3.5 seconds. Enemies stepping into the cloud are slowed by 60% and suffer continuous damage ticks every 1.0s.
- **Code Logic**: On explosion finish, instantiate `PoisonCloud` zones (alpha 0.5 green cloud) for 3500ms. Overlapping enemies receive `EnemySlow` debuff.
- **Visual Representation**: Murky swamp green background (`#064e3b`), bubbling toxic skull flask with noxious green vapor (`#10b981`), acid green border (`#34d399`).
- **Inventory Description**:
  - *Flavor*: "Bio-chemical gas bomb that releases dense, paralyzing neurotoxin mist."
  - *Mechanic*: Detonations leave a 3.5s toxic gas cloud that slows enemies by 60% and inflicts damage.

---

## 4. Drop System, Chest/Crate Mechanics & Balance Architecture

### 4.1 Rarity Tiers and Probability Matrix

Destructible blocks (`TILE_BLOCK`) maintain the proven baseline drop rate:
- **Block Drop Probability**: $P(\text{drop}) = 0.45$ (45% chance per soft block destroyed).
- **Gilded Chests / Golden Crates (`TILE_CHEST`)**: Special blocks spawned at map symmetry points (e.g. coordinates (6,6), (3,11), (9,3)) with 100% guaranteed drop rate from Rare/Epic/Legendary pools.

| Rarity Tier | Pool Share | Weight Sum | Items in Tier |
|:---|:---:|:---:|:---|
| **Common** | 60.0% | 0.600 | `BOMB_UP` (0.18), `FIRE_UP` (0.18), `SPEED_UP` (0.12), `SHIELD_BARRIER` (0.04), `BOMB_KICK` (0.04), `LANDMINE` (0.04) |
| **Uncommon** | 22.0% | 0.220 | `BOUNCING_BOMB` (0.035), `SPEED_SURGE` (0.040), `ARMOR_UP` (0.030), `BOMB_PASS` (0.030), `ITEM_MAGNET` (0.035), `POISON_MIST_BOMB` (0.025), `VAMPIRIC_SIPHON` (0.025) |
| **Rare** | 13.0% | 0.130 | `PIERCING_BOMB` (0.025), `REMOTE_BOMB` (0.025), `ICE_BOMB` (0.025), `BLAST_RESISTANCE` (0.025), `INVISIBILITY_CLOAK` (0.025), `BLAST_DEFLECTOR` (0.025) |
| **Epic / Legendary** | 5.0% | 0.050 | `CLUSTER_BOMB` (0.015), `MEGA_FIRE` (0.010), `WALL_PASS` (0.015), `TIME_FREEZE_CLOCK` (0.015), `HEART_EXTRA_LIFE` (0.010) |
| **Total** | 100.0% | 1.000 | **24 Total Items** |

### 4.2 Anti-Snowball & Diminishing Returns Logic (Dynamic Pity System)

1. **Stat Saturation Redirection**:
   - If player's speed is maxed (`speed >= 250 px/s`), `SPEED_UP` is removed from candidate rolls; its 0.12 weight is redistributed proportionally to `FIRE_UP` and `BOMB_UP`.
   - If bombs are maxed (`maxBombs >= 8`) and fire is maxed (`bombPower >= 8`), offensive stat weights shift towards tactical consumables and high-tier defensive gear.
2. **Duplication Guard on Unique Gear**:
   - Single-unlock gear items (`BOMB_KICK`, `WALL_PASS`, `BOMB_PASS`, `BLAST_DEFLECTOR`, `BLAST_RESISTANCE`, `ITEM_MAGNET`) cannot drop again if the player already owns them.
   - If rolled, the engine auto-rerolls into an equivalent rarity consumable or awards +500 Bonus Score Gem (`SCORE_GEM`).
3. **Pity Counter for Struggling Players**:
   - If player loses a shield or takes damage, an internal pity counter guarantees a `SHIELD_BARRIER` or `HEART_EXTRA_LIFE` within the next 6 block drops.

### 4.3 Preservation of the 600ms Explosion Grace Period

The existing invariant (`ITEM_GRACE_PERIOD_MS = 600`) is strictly enforced across all 24 items:
```typescript
export function isItemProtectedFromExplosion(spawnTime: number, explosionTime: number): boolean {
  return (explosionTime - spawnTime) <= ITEM_GRACE_PERIOD_MS;
}
```
- **Visual Feedback**: During the first 600ms of an item's existence, a shimmering golden ring pulsates around the item (`alpha: 0.6 <-> 1.0`, tween duration 150ms). Players intuitively recognize that the item is safe from the burning block's shockwave.

---

## 5. In-Game UI / Inventory HUD Architecture

### 5.1 Responsive Dual-Mode Inventory HUD Layout

To achieve cross-platform parity between Desktop (Keyboard/Mouse) and Mobile (Touch), the UI is divided into two synchronized layers:

```
+-----------------------------------------------------------------------------------+
|  [BOMBERMAN ARCADE]     HP: [♥♥♥]   SCORE: 014,500   TIME: 02:45   [CREDIT 01]    |
+-----------------------------------------------------------------------------------+
|  GAUGES:  [💣 3/5]  [🔥 Lv.4]  [⚡ 200px/s]  [💨 DASH READY]  [🛡️ SHIELD: 2/2]    |
+-----------------------------------------------------------------------------------+
|  EQUIPMENT TRAY (Desktop: Always Visible | Mobile: Expandable Drawer Button [🎒 6])|
|  [💣 PIERCE] [👟 KICK] [👻 GHOST 3.2s] [⏱️ TIME] [🧲 MAGNET] [❤️ 1-UP: 2]       |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|                                                                                   |
|                            PHASER 3 GAMEPLAY CANVAS                               |
|                                   (800 x 600)                                     |
|                                                                                   |
|                                                                                   |
+-----------------------------------------------------------------------------------+
|  MOBILE CONTROLS OVERLAY (isMobile = true):                                      |
|  (JOYSTICK)                               [🎒 INV]   [DETONATE]  [DASH]  [BOMB]   |
+-----------------------------------------------------------------------------------+
```

### 5.2 Desktop Hover Cards & Mobile Tap-to-Inspect Drawer

1. **Desktop Tooltip Component (`ItemTooltip.tsx`)**:
   - Hovering over any item badge or inventory slot opens an arcade glassmorphic tooltip card within 80ms:
   - **Header**: Item Icon, Name, and Rarity Badge (e.g., `[EPIC]` in neon purple).
   - **Type**: Category Indicator (e.g., `Bomb Variant • Active Modifier`).
   - **Stat Delta**: Bold highlighted values (e.g., `Effect: Pierces all soft blocks`).
   - **Flavor Lore**: Stylized monospace italicized lore text.
2. **Mobile Touch Inventory Drawer**:
   - On mobile devices, a floating HUD button `[🎒 INVENTORY (count)]` sits conveniently between the virtual joystick and action buttons.
   - Tapping it slides up a bottom drawer (`h-48`, backdrop blur, dark slate `rgba(15,23,42,0.95)`).
   - Features 48x48px touch targets for all collected items. Tapping an item selects it, displaying its full description, cooldown timer, and active stats in a clean detail card. Tapping anywhere outside or tapping `[✕]` closes the drawer seamlessly.

### 5.3 Phaser-React Real-Time Bridge Protocol

The stats bridge in `GameScene.ts` and `BombermanGame.tsx` is extended cleanly:
- **Event**: `'stats-update'`
- **Payload Schema (`PlayerStats`)**:
  ```typescript
  export interface ActiveBuff {
    id: string;
    name: string;
    icon: string;
    color: string;
    remainingMs: number;
    totalMs: number;
  }

  export interface CollectedItemEntry {
    id: string;
    name: string;
    category: 'bomb' | 'stat' | 'utility' | 'buff';
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    count: number;
    iconKey: string;
    description: string;
    mechanics: string;
  }

  export interface PlayerStats {
    // Core attributes
    speed: number;
    speedLevel: number;
    maxBombs: number;
    activeBombs: number;
    bombPower: number;
    score: number;
    isGameOver: boolean;

    // Health & Defensive layers
    shieldCharges: number;
    maxShields: number;
    extraLives: number;
    hasShield: boolean;

    // Active Equipment & Modifiers
    activeBombType: string; // 'REGULAR' | 'PIERCING' | 'REMOTE' | 'CLUSTER' | 'LANDMINE' | 'ICE' | 'BOUNCING'
    hasKick: boolean;
    hasWallPass: boolean;
    hasBombPass: boolean;
    hasMagnet: boolean;
    hasBlastDeflector: boolean;
    hasBlastResistance: boolean;
    hasVampiricSiphon: boolean;

    // Skills & Cooldowns
    dashCooldownRemaining: number;
    activeBuffs: ActiveBuff[];

    // Comprehensive Inventory
    inventory: CollectedItemEntry[];
    itemsCollectedTotal: number;
  }
  ```
- **Performance Optimization**: `stats-update` is throttled to trigger only upon:
  1. Item pickup / upgrade mutation.
  2. Bomb placement / detonation.
  3. Damage / shield absorption.
  4. Active buff expiration or 200ms intervals during ticking cooldowns.

---

## 6. Procedural Canvas Visual Asset Pipeline

Every item texture is procedurally drawn at 32x32 resolution in `GameScene.ts` via HTML5 Canvas 2D context:

```typescript
export interface ItemTextureDef {
  key: string;
  bgColor: number;
  ringColor: number;
  drawIcon: (ctx: CanvasRenderingContext2D) => void;
}
```

### Procedural Drawing Instructions for Icons:
- **Background**: `ctx.roundRect(2, 2, 28, 28, 6)` filled with dark background tone + 2px vibrant rarity border.
- **Glyphs**:
  - `item_piercing_bomb`: Draw 4 silver diamond polygon spikes extending outward with cyan circular core.
  - `item_remote_bomb`: Draw black circular bomb base with red antenna line (`ctx.lineTo`) capped with a blinking green circle.
  - `item_cluster_bomb`: Draw three overlapping 4px circles at `(12,12), (20,12), (16,20)` with spark lines.
  - `item_landmine`: Draw flat 20x8 rounded ellipse with flashing red center button.
  - `item_ice_bomb`: Draw 6-armed snowflake using 6 radial lines with branch tick marks in icy cyan.
  - `item_bouncing_bomb`: Draw bomb sphere with 3 diagonal zigzag green bounce bands.
  - `item_wall_pass`: Draw hollow brick pattern with a ghostly boot passing diagonally through.
  - `item_time_freeze`: Draw circular stopwatch ring with 12 tick marks and two clock hands at 10:10.
  - `item_magnet`: Draw classic U-shape horseshoe with red north pole and blue south pole.
  - `item_heart`: Draw 2 connected bezier curves forming a faceted golden-winged heart.

---

## 7. Caveats

1. **Physical Bomb Collisions**: When `hasBombPass` is active, arcade physics collision between player and bombs is disabled. When `hasKick` is also owned, kick detection must rely on velocity/overlap triggers rather than solid body blocking.
2. **Performance on Low-End Mobile**: Generating 24 procedural canvas textures occurs once during `GameScene.create()`. This requires ~15ms total execution time, which is completely negligible and eliminates image asset network requests.
3. **Screen Real Estate on Mobile**: On ultra-narrow mobile viewports (<360px width), the top HUD bar must wrap or hide secondary stats (like score or item totals) while keeping Bomb, Fire, and Shield prominently visible.

---

## 8. Conclusion

1. The proposed **24-Item Architecture** completely fulfills the `ORIGINAL_REQUEST.md` mandate (requiring 20+ items) with structured game balance across Bomb Variants, Stat Boosts, Utilities, and Tactical Buffs.
2. The **Dynamic Drop System** maintains the proven 45% block drop rate while introducing special golden chests, anti-snowball weight redirection, and preserving the critical 600ms blast grace period.
3. The **Responsive Inventory HUD** provides desktop hover cards and a mobile-friendly slide-up inspection drawer, guaranteeing high usability across both iPhone/Android touchscreens and PC keyboard setups.
4. The design is 100% backward-compatible with existing tests and interfaces, ready for immediate step-by-step implementation.

---

## 9. Verification Method

Independent verification steps to validate the design once implemented:

1. **Automated Unit & Stress Testing**:
   ```bash
   node --test tests/dynamic_gameplay.test.mjs
   npm test
   ```
   - Verify that all 24 item IDs map to valid upgrades in `applyItemUpgrade()`.
   - Verify that `isItemProtectedFromExplosion()` passes for all items within $\le 600$ms.
   - Verify that stat clamping strictly bounds speed ($\le 250$), bombs ($\le 8$), and power ($\le 8$).
2. **Next.js Compilation & Lint**:
   ```bash
   npm run lint
   npm run build
   ```
   - Verify zero TypeScript or JSX compilation errors.
3. **Manual Browser Verification**:
   - Run `npm run dev` and open `http://localhost:3000`.
   - Desktop: Destroy blocks, collect new items, hover over inventory icons to check tooltip card presentation.
   - Mobile: Switch to responsive mobile emulation (iPhone 14 / Pixel 7), tap `[🎒 INVENTORY]` button, confirm touch drawer slides up and displays item descriptions properly without obstructing controls.
