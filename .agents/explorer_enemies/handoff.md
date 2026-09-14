# Normal Enemies Design Specification & Handoff Report

## Executive Summary
This document provides the definitive game design specification for **Normal Enemies** in the Cute Web Bomberman game. The roster consists of **8 distinct, charming enemy archetypes** grounded in a pastel candy/dessert/animal aesthetic. Each enemy is engineered with distinct movement algorithms, tactical bomb interactions, expressive emoji-and-canvas visual styling, and clear difficulty progression across four thematic worlds.

---

## 1. Observation
1. **Existing Game Engine & Architecture**:
   - `src/game/GameScene.ts:3-5`: Grid size is fixed at `ROWS = 13`, `COLS = 15`, with `TILE_SIZE = 40`.
   - `src/game/GameScene.ts:7-9`: Tile types defined as `TILE_EMPTY = 0`, `TILE_WALL = 1`, `TILE_BLOCK = 2`.
   - `src/game/GameScene.ts:189`: Player speed is `150 px/s` (3.75 tiles/sec).
   - `src/game/GameScene.ts:211`: Current enemy prototype speed is `60 px/s` (1.5 tiles/sec, 40% of player speed).
   - `src/game/GameScene.ts:218-232`: Current enemy AI is a rudimentary 4-direction random walk that only turns upon colliding with obstacles (`enemy.body.blocked`).
   - `src/game/GameScene.ts:260-298`: Bomb logic features a 2000ms fuse delay, 300ms explosion lifetime, and cross-blast wave propagation that halts at walls and destroys breakable blocks.
   - `src/game/GameScene.ts:311-314`: Enemies currently die in a single hit with zero special death mechanics (`enemyHit.destroy()`).
2. **Design & Aesthetic Directives**:
   - `ORIGINAL_REQUEST.md:13-14`: Requires "Normal enemies with unique movement patterns" for a comprehensive GDD.
   - `ORIGINAL_REQUEST.md:20-21`: UI revamp concept emphasizing "pure CSS, HTML Canvas, and emojis to make the game look exceptionally cute and polished, without requiring external image assets."
   - `COLLABORATION.md:5-7`: Developer persona Max targeting cross-platform mobile/PC, cute pastel aesthetic, hosted on Vercel.

---

## 2. Logic Chain
1. **Observation Ref (GameScene.ts:211, 218-232)**: The current enemy AI is completely passive, predictable, and mono-dimensional. Players can easily corner or ignore them.
2. **Inference 1 (Pacing & Threat Variety)**: To create engaging Bomberman gameplay, normal enemies must exert distinct forms of pressure:
   - *Line-of-sight aggression* (charging when aligned).
   - *Spatial navigation bypass* (jumping over bombs or phasing through soft blocks).
   - *Counter-play disruption* (kicking bombs, defusing bombs, or floating bombs).
   - *Tactical patience* (shielding against explosions, cowardice, or stealth).
3. **Observation Ref (ORIGINAL_REQUEST.md:20-21 & GameScene.ts:31-74)**: Texture generation is currently done via procedural Canvas graphics. Emojis plus Canvas 2D filters/glows allow 100% zero-asset cute animations (squash, stretch, blink, dizzy stars).
4. **Inference 2 (Aesthetic Cohesion)**: Every enemy archetype is given a dessert/celestial cute theme (Pudding, Marshmallow Cloud, Chocolate Truffle, Shooting Star, Candy Snail, Soda Bubble Fish, Lollipop Bandit, Berry Ghost) with pastel color codes and expressive Unicode emojis.
5. **Observation Ref (GameScene.ts:189, player speed = 150 px/s)**:
   - Player moves at 3.75 tiles/s.
   - Fast enemies should not exceed player speed unless in a straight charge, ensuring fair reaction windows on mobile touch screens.
   - Normal speeds are tuned between 0.75 tiles/s (heavy tank) to 2.25 tiles/s (nimble thief).

---

## 3. Comprehensive Normal Enemy Suite (8 Archetypes)

### 3.1 Slime Hopper 🍮 (Purin Jelly)
* **Concept & Lore**: A wobbly custard pudding with caramel sauce that bounced off the bakery counter. It innocently wobbles through the maze, hopping over small obstacles with a cheerful jiggle.
* **Visuals & Canvas Styling**:
  - Primary Emoji: 🍮
  - Palette: Custard Yellow (`#FFE066`), Caramel Brown (`#8B4513`), Strawberry Pink Blush (`#FF85A1`).
  - Render Effect: Sinusoidal squash-and-stretch: `scaleY = 1 + 0.15 * sin(time * 8)`, `scaleX = 1 - 0.15 * sin(time * 8)`.
* **Core Stats**:
  - HP: 1 Hit.
  - Speed: 1.25 tiles/sec (50 px/s; 33% player speed) during crawl; bursts to 2.5 tiles/sec during hop.
  - Bomb Interaction: **Hop-Over!** Every 3 tiles traveled, it executes a 1-tile leap. If a bomb is placed in front of it during a leap, it hops right over the bomb without triggering collision or kicking it.
* **AI & Movement Algorithm**:
  ```
  State Machine: [PATROL_CRAWL] -> [HOP_WINDUP] -> [AIRBORNE_LEAP] -> [LANDING]
  
  function updateSlimeHopper(enemy, dt):
    if enemy.state == PATROL_CRAWL:
      moveInDirection(enemy.dir, enemy.crawlSpeed)
      enemy.stepCounter += dt
      if isBlocked(enemy.dir):
        enemy.dir = pickRandomOpenDirection([UP, DOWN, LEFT, RIGHT] \ {enemy.dir})
      else if enemy.stepCounter >= 2.5: // Every 2.5 seconds
        enemy.state = HOP_WINDUP
        enemy.timer = 0.35 // Windup duration
        
    else if enemy.state == HOP_WINDUP:
      applySquash(enemy, 0.7, 1.3) // Flatten down
      enemy.timer -= dt
      if enemy.timer <= 0:
        enemy.state = AIRBORNE_LEAP
        enemy.timer = 0.4
        enemy.jumpTarget = enemy.tilePos + enemy.dir
        
    else if enemy.state == AIRBORNE_LEAP:
      applyStretch(enemy, 1.3, 0.7) // Stretch upward
      enemy.elevation = sin((0.4 - enemy.timer) / 0.4 * PI) * 16 // 16px arc
      ignoreBombCollisions(enemy, true) // Pass through bombs
      moveToward(enemy.jumpTarget, enemy.hopSpeed)
      enemy.timer -= dt
      if enemy.timer <= 0:
        enemy.state = LANDING
        enemy.timer = 0.2
        ignoreBombCollisions(enemy, false)
        
    else if enemy.state == LANDING:
      applySquash(enemy, 1.2, 0.8)
      spawnCaramelDroplets(enemy.pos)
      enemy.stepCounter = 0
      enemy.state = PATROL_CRAWL
  ```
* **Death Effect & Special Mechanic**:
  - **Caramel Puddle**: Leaves a sticky 1-tile caramel syrup puddle for 4.0 seconds. Any entity walking through the puddle has movement speed reduced by 50%. If the player walks over it, they collect +100 "Sweet Points".
* **Spawn Weights & Scaling**:
  - World 1: 45% | World 2: 30% | World 3: 20% | World 4: 10%
  - Harder Stages Modifier: Spawns 2 Mini-Puddings 🍮 (0.5 size, 2.0 tiles/s, 1 hit) upon defeat.

---

### 3.2 Cloud Floater ☁️ (Puff Fluff)
* **Concept & Lore**: A gentle marshmallow cumulus cloud drifting dreamily on high air currents. Because it floats effortlessly, ground-level breakable blocks cannot block its path.
* **Visuals & Canvas Styling**:
  - Primary Emoji: ☁️
  - Palette: Cotton Candy Sky Blue (`#BEE1E6`), Marshmallow White (`#FFFFFF`), Cheerful Rose (`#FAD2E1`).
  - Render Effect: Gentle vertical hovering oscillation: `offsetY = sin(time * 3) * 4px`. Soft pastel halo glow (`shadowBlur = 10`, `shadowColor = '#BEE1E6'`).
* **Core Stats**:
  - HP: 1 Hit.
  - Speed: 1.0 tile/sec (40 px/s; 27% player speed, slow and dreamy).
  - Bomb Interaction: **Drifts Over Bombs!** Does not collide with placed bombs, but is vulnerable to bomb explosions.
  - Obstacle Interaction: **Phases through Soft Blocks (TILE_BLOCK)!** Only hard outer/pillar walls (TILE_WALL) stop it.
* **AI & Movement Algorithm**:
  ```
  State Machine: [LAZY_DRIFT] -> [WIND_SNEEZE]
  
  function updateCloudFloater(enemy, dt):
    // Moves continuously through soft blocks
    moveContinuous(enemy.dir, enemy.speed)
    
    // Only collides with indestructible walls
    if collidesWithWall(enemy.pos + enemy.dir * 4):
      validDirs = getNonWallDirections(enemy.pos)
      // Prefer turning toward player's quadrant
      enemy.dir = selectWeightedDirection(validDirs, target=Player.pos)
      
    // Special Wind Sneeze Ability
    enemy.sneezeCooldown -= dt
    if enemy.sneezeCooldown <= 0:
      adjacentBombs = getBombsInAdjacentTiles(enemy.tilePos)
      if adjacentBombs.length > 0:
        enemy.state = WIND_SNEEZE
        for bomb in adjacentBombs:
          pushVector = (bomb.tilePos - enemy.tilePos)
          pushBomb(bomb, pushVector, tiles=1) // Pushes bomb 1 tile away!
        playPuffParticles(enemy.pos)
        enemy.sneezeCooldown = 6.0
  ```
* **Death Effect & Special Mechanic**:
  - **Cotton Mist**: Dissolves into a 3x3 pastel cloud mist lasting 3.5s. Dampens explosion blast waves passing through the mist, shortening explosion range by 1 tile!
* **Spawn Weights & Scaling**:
  - World 1: 15% | World 2: 30% | World 3: 25% | World 4: 20%
  - Harder Stages Modifier: Increases drift speed to 1.4 tiles/sec and reduces sneeze cooldown to 4.0s.

---

### 3.3 Choco Rusher 🍫 (Truffle Dash)
* **Concept & Lore**: A high-energy dark chocolate truffle wrapped in shiny golden foil. Usually saunters calmly until it spots the player down a straight corridor—then it triggers an adrenaline-fueled sugar rush!
* **Visuals & Canvas Styling**:
  - Primary Emoji: 🍫
  - Palette: Dark Cocoa (`#3D1E10`), Gold Foil (`#F4C430`), Mint Green Sneakers (`#98FF98`).
  - Render Effect: Dust dash trails behind it during charge. An alert icon `❗️` pops up above its head when player is spotted.
* **Core Stats**:
  - HP: 2 Hits (Hit 1 rips off golden foil armor; Hit 2 dissolves the chocolate core).
  - Speed: Patrol: 1.5 tiles/sec (60 px/s; 40% player speed). Charge: 3.75 tiles/sec (150 px/s; **100% player speed**).
  - Bomb Interaction: **Bomb Kicker!** When in charge mode, if it hits a bomb, it kicks the bomb sliding forward up to 3 tiles until the bomb hits an obstacle!
* **AI & Movement Algorithm**:
  ```
  State Machine: [PATROL] -> [ALERT_PAUSE] -> [SUGAR_CHARGE] -> [DIZZY_STUN]
  
  function updateChocoRusher(enemy, dt):
    if enemy.state == PATROL:
      moveAlongGrid(enemy.dir, enemy.patrolSpeed)
      if atTileCenter(enemy.pos):
        // Check 4 cardinal directions with Raycast
        lineOfSightDir = checkRaycastToPlayer(enemy.tilePos, maxDist=8)
        if lineOfSightDir != null and hasClearPath(enemy.tilePos, lineOfSightDir):
          enemy.chargeDir = lineOfSightDir
          enemy.state = ALERT_PAUSE
          enemy.timer = 0.35 // Quick lock-on freeze
          playSfx("whistle_alert")
        else if isBlocked(enemy.dir):
          enemy.dir = pickPerpendicularTurn(enemy.dir)
          
    else if enemy.state == ALERT_PAUSE:
      enemy.timer -= dt
      if enemy.timer <= 0:
        enemy.state = SUGAR_CHARGE
        
    else if enemy.state == SUGAR_CHARGE:
      moveVelocity(enemy.chargeDir, enemy.chargeSpeed)
      spawnDustTrail(enemy.pos)
      
      hitBomb = checkBombCollision(enemy.pos)
      if hitBomb:
        kickBomb(hitBomb, direction=enemy.chargeDir, velocity=300)
        
      if collidesWithWallOrBlock(enemy.pos):
        shakeCamera(intensity=2, duration=100)
        enemy.state = DIZZY_STUN
        enemy.timer = 0.9 // Stunned for 0.9s
        
    else if enemy.state == DIZZY_STUN:
      renderSpinningStars(enemy.pos, count=3) // 💫
      enemy.timer -= dt
      if enemy.timer <= 0:
        enemy.dir = invertDirection(enemy.chargeDir)
        enemy.state = PATROL
  ```
* **Death Effect & Special Mechanic**:
  - **Choco Crumble**: Shatters into 3 chocolate drop bonus items. Walking over them gives +150 points. If a bomb explosion hits the chocolate drops, they trigger micro-sparklers that clear adjacent soft blocks.
* **Spawn Weights & Scaling**:
  - World 1: 10% | World 2: 25% | World 3: 25% | World 4: 30%
  - Harder Stages Modifier: Charge windup reduced from 0.35s to 0.15s; charge speed increases to 4.2 tiles/sec (112% player speed).

---

### 3.4 Star Seeker ⭐ (Sparkle Guide)
* **Concept & Lore**: A curious, twinkling stellar sprite that fell into the candy labyrinth. It is magnetically drawn to the player using acute sensory starlight, but possesses an instinctive fear of ticking bombs.
* **Visuals & Canvas Styling**:
  - Primary Emoji: ⭐
  - Palette: Radiant Pastel Lemon (`#FFF3B0`), Astral Lilac (`#E2C2FF`), Shimmering Halo (`#FFD166`).
  - Render Effect: Pulsing star points with spinning stardust glitter particles radiating outward.
* **Core Stats**:
  - HP: 1 Hit.
  - Speed: 1.8 tiles/sec (72 px/s; 48% player speed).
  - Bomb Interaction: **Smart Bomb Avoider!** Evaluates active bomb timers and blast trajectories. Actively routes around danger zones.
* **AI & Movement Algorithm**:
  ```
  State Machine: [HUNT_PATHFIND] -> [BOMB_PANIC]
  
  function updateStarSeeker(enemy, dt):
    if atTileCenter(enemy.pos):
      dangerGrid = calculateBombDangerZones(lookaheadSeconds=2.0)
      
      // If current tile is in danger zone
      if dangerGrid[enemy.tilePos.x][enemy.tilePos.y] == DANGER:
        safeNeighbors = getNeighbors(enemy.tilePos).filter(n => dangerGrid[n.x][n.y] == SAFE and isWalkable(n))
        if safeNeighbors.length > 0:
          enemy.dir = pickClosestToGoal(safeNeighbors, goal=Player.pos)
        else:
          // Trapped in blast zone! Tremble in place
          enemy.state = BOMB_PANIC
          return
      else:
        enemy.state = HUNT_PATHFIND
        // Run BFS / A* to find shortest path to player avoiding dangerGrid
        pathToPlayer = findAStarPath(enemy.tilePos, Player.tilePos, costModifier=dangerGrid)
        if pathToPlayer.length > 0:
          enemy.dir = pathToPlayer[0].direction
        else:
          enemy.dir = pickRandomWalkableDirection(enemy.tilePos)
          
    moveInDirection(enemy.dir, enemy.speed)
  ```
* **Death Effect & Special Mechanic**:
  - **Starlight Supernova**: Bursts into 4 sparkling stardust beams that travel 1 tile in cardinal diagonals (`NW`, `NE`, `SW`, `SE`). These beams break soft blocks and detonate any chained bombs instantly.
* **Spawn Weights & Scaling**:
  - World 1: 5% | World 2: 15% | World 3: 20% | World 4: 35%
  - Harder Stages Modifier: Re-evaluates pathfinding every 0.25 tiles instead of at full tile intersections.

---

### 3.5 Sleepy Snail 🐌 (Shell Shield / Escar-Glow)
* **Concept & Lore**: A perpetually sleepy snail with a hard peppermint candy-swirl shell. It plods calmly along corridors hugging the walls. When danger erupts nearby, it withdraws into its indestructible shell.
* **Visuals & Canvas Styling**:
  - Primary Emoji: 🐌 (Active) / 🍥 (Withdrawn Shell)
  - Palette: Mint Cream Body (`#D8F3DC`), Strawberry-Vanilla Swirl Shell (`#FF6B6B`), Snooze bubbles (`💤`).
  - Render Effect: Leaves a glistening translucent slime trail on the floor that slowly evaporates over 3 seconds.
* **Core Stats**:
  - HP: 3 Hits total (Outside shell: 1 hit defeats. Inside shell: 2 hits to crack the shell).
  - Speed: 0.75 tiles/sec (30 px/s; 20% player speed; ultra-slow heavy walker).
  - Bomb Interaction: **Bomb Bulldozer!** When walking into a bomb, it pushes the bomb forward 1 tile at half-speed (0.375 tiles/sec).
* **AI & Movement Algorithm**:
  ```
  State Machine: [WALL_HUG_SLITHER] -> [RETRACT_SHELL] -> [PEEK_CAUTIOUS]
  
  function updateSleepySnail(enemy, dt):
    if enemy.state == WALL_HUG_SLITHER:
      // Left-hand wall hugging algorithm
      desiredDir = getLeftHandDirection(enemy.dir)
      if isWalkable(enemy.tilePos + desiredDir):
        enemy.dir = desiredDir
      else if isBlocked(enemy.tilePos + enemy.dir):
        enemy.dir = getRightHandDirection(enemy.dir)
      moveAlongGrid(enemy.dir, enemy.crawlSpeed)
      
      // Check for nearby explosions or placed bombs within 2 tiles
      if hasNearbyExplosion(enemy.pos, radius=2.5) or isBombAboutToExplode(enemy.pos, radius=2):
        enemy.state = RETRACT_SHELL
        enemy.shellTimer = 3.0 // Stay shielded for 3s
        enemy.isArmored = true
        
    else if enemy.state == RETRACT_SHELL:
      setVelocity(0, 0)
      enemy.shellTimer -= dt
      // Player can walk into retracted snail without taking damage;
      // In fact, player can KICK the shell!
      if enemy.shellTimer <= 0:
        enemy.state = PEEK_CAUTIOUS
        enemy.peekTimer = 0.6
        
    else if enemy.state == PEEK_CAUTIOUS:
      enemy.peekTimer -= dt
      if enemy.peekTimer <= 0:
        enemy.isArmored = false
        enemy.state = WALL_HUG_SLITHER
  ```
* **Death Effect & Special Mechanic**:
  - **Bowling Shell**: When defeated, its peppermint shell does not vanish immediately; it stays as a kickable shell prop for 6 seconds! If kicked by the player or pushed by an explosion, the shell rockets down the row/column, destroying all soft blocks and crushing any enemies in its path until it hits a hard wall.
* **Spawn Weights & Scaling**:
  - World 1: 15% | World 2: 20% | World 3: 20% | World 4: 15%
  - Harder Stages Modifier: Shell recovery time shortened from 3.0s to 1.8s; bulldozer push speed increased.

---

### 3.6 Bubble Fish 🫧 (Float Hopper / Guppy Bubble)
* **Concept & Lore**: An adorable pastel guppy floating inside a resilient sparkling soda bubble. It bobs gently in diagonal trajectories, unaffected by floor holes, and can encase bombs inside soap bubbles!
* **Visuals & Canvas Styling**:
  - Primary Emoji: 🫧 (Outer bubble) / 🐠 (Inner guppy)
  - Palette: Iridescent Cyan (`#48CAE4`), Coral Peach (`#FFA69E`), Translucent Sheen (`rgba(255,255,255,0.6)`).
  - Render Effect: Bubble wobble shader with shimmering rainbow highlights and miniature fizzing air bubbles rising upward.
* **Core Stats**:
  - HP: 2 Hits (Hit 1: Bubble pops, guppy drops to ground; Hit 2: Guppy defeated).
  - Speed: Bubble Phase: 1.5 tiles/sec (60 px/s). Ground Flop Phase: 0.8 tiles/sec (erratic twitches).
  - Bomb Interaction: **Bubble Encapsulation!** When touching a placed bomb, the Bubble Fish wraps the bomb in a buoyant soap bubble. The bomb floats off the floor for 3.0 seconds, rendering it immune to ground kicks and causing its explosion to burst with harmless sparkling water unless popped!
* **AI & Movement Algorithm**:
  ```
  State Machine: [DIAGONAL_BOUNCE] -> [FLOOR_FLOP] -> [RE_BUBBLE]
  
  function updateBubbleFish(enemy, dt):
    if enemy.state == DIAGONAL_BOUNCE:
      // Moves diagonally (vx = +-speed, vy = +-speed)
      moveDiagonal(enemy.vx, enemy.vy)
      
      // Reflect off hard walls and soft blocks
      if hitsHorizontalObstacle(enemy.pos):
        enemy.vy *= -1
      if hitsVerticalObstacle(enemy.pos):
        enemy.vx *= -1
        
      // Check collision with bombs
      bomb = getIntersectingBomb(enemy.pos)
      if bomb and not bomb.isBubbled:
        bubbleBomb(bomb) // Elevates bomb, delays fuse +1.5s
        
    else if enemy.state == FLOOR_FLOP:
      // Triggered after taking 1 explosion hit (Bubble pops)
      enemy.flopTimer -= dt
      applyFlopAnimation(enemy) // Random small hops
      if enemy.flopTimer <= 0:
        enemy.state = RE_BUBBLE
        playBubbleRegenEffect(enemy.pos)
        enemy.hp = 2
        enemy.state = DIAGONAL_BOUNCE
  ```
* **Death Effect & Special Mechanic**:
  - **Soap Suds Splash**: Pops with a refreshing sound effect, clearing all floor traps/caramel puddles within a 3x3 radius and granting +1 Bomb Power to any player bomb detonated within the splash zone during the next 5 seconds.
* **Spawn Weights & Scaling**:
  - World 1: 5% | World 2: 10% | World 3: 35% | World 4: 15%
  - Harder Stages Modifier: Flop recovery duration shortened from 4.0s to 2.0s; bubble shield absorbs 2 hits before popping.

---

### 3.7 Candy Thief 🍬 (Lollipop Bandit)
* **Concept & Lore**: A sneaky little racoon-tailed pastry bandit wearing a striped bandit mask and toting a sack of stolen sweets. It hungers for dropped power-ups and will even steal ticking bombs directly from the floor!
* **Visuals & Canvas Styling**:
  - Primary Emoji: 🍬 (Bandit sack) / 🦝 (Bandit face)
  - Palette: Mischief Magenta (`#D90429`), Sugar Mint (`#A7FFEB`), Bandit Mask Navy (`#1D2D44`).
  - Render Effect: Footstep puff particles and a gleaming eye twinkle whenever loot is detected.
* **Core Stats**:
  - HP: 1 Hit.
  - Speed: Scavenging: 2.25 tiles/sec (90 px/s; 60% player speed). Loot Sprint: 3.2 tiles/sec (128 px/s; 85% player speed).
  - Bomb Interaction: **Bomb Swallower / Defuser!** If it runs over a bomb, it stuffs the bomb into its candy sack. After a 2.5s digestive timer, it burps out a harmless shower of party confetti 🎉, neutralizing the bomb! If another explosion hits it while a bomb is in its sack, the bomb detonates instantly inside, destroying the thief.
* **AI & Movement Algorithm**:
  ```
  State Machine: [HUNT_LOOT] -> [DEFUSE_SWALLOW] -> [FLEE_PLAYER]
  
  function updateCandyThief(enemy, dt):
    if enemy.state == HUNT_LOOT:
      // Prioritize: 1. Power-ups on board, 2. Placed player bombs, 3. Random patrol
      targetItem = findNearestItemOrBomb(enemy.tilePos)
      if targetItem != null:
        enemy.dir = getAStarDirection(enemy.tilePos, targetItem.tilePos)
        moveInDirection(enemy.dir, enemy.scavengeSpeed)
        if enemy.tilePos == targetItem.tilePos:
          if targetItem.isBomb:
            swallowBomb(enemy, targetItem)
            enemy.state = DEFUSE_SWALLOW
            enemy.defuseTimer = 2.5
          else:
            stealPowerUp(enemy, targetItem)
            enemy.state = FLEE_PLAYER
      else:
        wanderRandomCorridor(enemy)
        
    else if enemy.state == DEFUSE_SWALLOW:
      enemy.defuseTimer -= dt
      renderSwellingBellyAnimation(enemy)
      if enemy.defuseTimer <= 0:
        spawnConfettiParticles(enemy.pos) // Harmless defusal!
        playSfx("hiccup_burp")
        enemy.state = HUNT_LOOT
        
    else if enemy.state == FLEE_PLAYER:
      // Flee toward farthest corner from player
      fleeGoal = getFarthestCorner(Player.pos)
      enemy.dir = getAStarDirection(enemy.tilePos, fleeGoal)
      moveInDirection(enemy.dir, enemy.fleeSpeed)
  ```
* **Death Effect & Special Mechanic**:
  - **Piñata Gift Shower**: When defeated, drops all items it stole, PLUS a guaranteed rare power-up (e.g. Speed Boots, Bomb Up, Fire Up, or Heart Extra Life).
* **Spawn Weights & Scaling**:
  - World 1: 5% | World 2: 15% | World 3: 20% | World 4: 25%
  - Harder Stages Modifier: Defusal digest time cut from 2.5s down to 1.5s; movement speed during flee increased to 3.5 tiles/sec.

---

### 3.8 Berry Ghost 🍓 (Phantom Sweet / Boo-Berry)
* **Concept & Lore**: A translucent strawberry meringue phantom wearing a tiny pastry chef hat. Extremely timid and self-conscious, it gets flustered and covers its eyes whenever the player looks directly at it, turning intangible!
* **Visuals & Canvas Styling**:
  - Primary Emoji: 🍓 (Fruit ghost body) / 👻 (Spirit tail)
  - Palette: Translucent Strawberry Red (`rgba(255, 75, 110, 0.75)`), Meringue Cream (`#FFF0F5`), Blushing Cheeks (`#FF3366`).
  - Render Effect: Ghostly wavy float trail with fading opacity oscillations: `alpha = 0.4 + 0.3 * sin(time * 4)`.
* **Core Stats**:
  - HP: 1 Hit.
  - Speed: 1.6 tiles/sec (64 px/s; 43% player speed).
  - Bomb Interaction: **Intangible in Shy Phase!** When the player faces the Berry Ghost, it covers its eyes in embarrassment and becomes 100% immune to bomb blast waves. When the player faces away, it solidifies and pursues, becoming fully vulnerable to explosions.
* **AI & Movement Algorithm**:
  ```
  State Machine: [SHY_COVER_EYES] <--> [STEALTH_STALK]
  
  function updateBerryGhost(enemy, dt):
    isPlayerFacingMe = checkPlayerFacingTarget(Player.pos, Player.facingDir, enemy.pos)
    
    if isPlayerFacingMe:
      // SHY PHASE
      enemy.state = SHY_COVER_EYES
      enemy.isInvulnerableToBlasts = true
      enemy.isLethalToPlayer = false
      enemy.alpha = 0.35 // Becomes translucent
      renderEmoji(enemy.pos, "🙈🍓") // Covers eyes
      setVelocity(0, 0) // Freezes in tracks
      
    else:
      // STALK PHASE
      enemy.state = STEALTH_STALK
      enemy.isInvulnerableToBlasts = false
      enemy.isLethalToPlayer = true
      enemy.alpha = 0.95 // Becomes solid
      renderEmoji(enemy.pos, "😋🍓") // Playful grin
      
      // Glides directly through soft blocks (TILE_BLOCK) toward player!
      directVector = normalize(Player.pos - enemy.pos)
      moveAlongVector(directVector, enemy.speed, ignoreSoftBlocks=true)
  ```
* **Death Effect & Special Mechanic**:
  - **Strawberry Jam Slip**: Upon defeat, leaves a pot of sweet strawberry jam on the tile. If the player consumes the jam, they gain the "Ghost Walk" buff for 5 seconds, allowing the player to walk freely through breakable soft blocks!
* **Spawn Weights & Scaling**:
  - World 1: 0% | World 2: 10% | World 3: 15% | World 4: 35%
  - Harder Stages Modifier: Begins to stalk if player is facing away at an angle > 45 degrees; stalk speed increases to 2.0 tiles/sec.

---

## 4. Comprehensive Interaction Matrix

The matrix below defines the exact behavioral physics and collision resolutions between all 8 normal enemies and every interactive game entity.

| Enemy Archetype | Placed Bomb Collision | Bomb Explosion Wave | Breakable Block (Soft) | Indestructible Wall (Hard) | Other Enemies | Floor Hazard (Puddles / Holes) |
|---|---|---|---|---|---|---|
| **1. Slime Hopper 🍮** | Hops over during leap; blocks path during crawl | Takes 1 dmg (Dies); leaves caramel puddle | Blocked; turns perpendicular | Blocked; turns | Pushes past; gentle elastic bounce | Slowed by 50% in caramel puddles |
| **2. Cloud Floater ☁️** | Drifts over bomb; no collision | Takes 1 dmg (Dies); drops mist | **Phases through** smoothly | Blocked; turns towards open avenue | Drifts over; no collision | Immune to ground hazards / holes |
| **3. Choco Rusher 🍫** | **Kicks bomb** 3 tiles on charge; turns on patrol | Takes 1 dmg (Foil breaks first, then dies) | Stuns on charge hit; destroys if fast | Blocked; stuns on charge impact | Knocks lighter enemies back 1 tile | Ignores puddles during full charge |
| **4. Star Seeker ⭐** | **Actively avoids** (repelled by 2-tile radius) | Takes 1 dmg (Dies); fires starlight beams | Blocked; pathfinds around | Blocked; pathfinds around | Slips around via A* routing | Avoids hazardous tiles via pathfinder |
| **5. Sleepy Snail 🐌** | **Pushes bomb** 1 tile (Bulldozer) | Outside: 1 dmg. Inside shell: Takes 1/2 dmg | Blocked; hugs left-hand edge | Blocked; clockwise turn | Blocks lighter enemies; immovable | Slimes floor; immune to floor traps |
| **6. Bubble Fish 🫧** | **Encases bomb** in float bubble | Pop bubble (Hit 1); defeat fish (Hit 2) | Bounces diagonally at 90° angles | Bounces diagonally at 90° angles | Bounces off companion bubbles | Hovers above holes and floor spikes |
| **7. Candy Thief 🍬** | **Swallows & defuses** bomb (2.5s) | Takes 1 dmg (Detonates bomb inside if full) | Blocked; seeks shortest route | Blocked; turns | Steals drops from falling allies | Navigates around sticky puddles |
| **8. Berry Ghost 🍓** | Phases through bomb | Immune if facing; Dies if player facing away | **Phases through** in stalk mode | Blocked by hard boundaries | Glides through without friction | Ignores all ground hazards |

---

## 5. Difficulty Scaling & World Distribution

The game progresses through 4 thematic candy worlds, each introducing more challenging enemy compositions and higher density:

| World & Theme | Total Enemy Count | Common (60%) | Uncommon (30%) | Rare / Elite (10%) | World Special Hazard Interaction |
|---|---|---|---|---|---|
| **World 1: Candy Meadow** (Pastel Plains) | 3 - 5 enemies | Slime Hopper 🍮 (45%)<br>Sleepy Snail 🐌 (15%) | Cloud Floater ☁️ (15%)<br>Choco Rusher 🍫 (10%) | Star Seeker ⭐ (5%)<br>Candy Thief 🍬 (5%) | Gentle grass; standard 40px grid; low speed |
| **World 2: Pastry Peaks** (Waffle Cliffs) | 5 - 7 enemies | Cloud Floater ☁️ (30%)<br>Slime Hopper 🍮 (30%) | Choco Rusher 🍫 (25%)<br>Sleepy Snail 🐌 (20%) | Star Seeker ⭐ (15%)<br>Candy Thief 🍬 (15%) | Syrup drips create natural sticky zones; enemies adapt |
| **World 3: Soda Sea** (Effervescent Bay) | 6 - 8 enemies | Bubble Fish 🫧 (35%)<br>Cloud Floater ☁️ (25%) | Choco Rusher 🍫 (25%)<br>Star Seeker ⭐ (20%) | Sleepy Snail 🐌 (20%)<br>Berry Ghost 🍓 (15%) | Water currents push floating bombs and Bubble Fish |
| **World 4: Cosmic Confiserie** (Starlight Galaxy) | 7 - 10 enemies | Star Seeker ⭐ (35%)<br>Berry Ghost 🍓 (35%) | Choco Rusher 🍫 (30%)<br>Candy Thief 🍬 (25%) | Cloud Floater ☁️ (20%)<br>Sleepy Snail 🐌 (15%) | Low-gravity tiles amplify bomb push speeds by 1.5x |

### Scaling Formula
For stage $S \in [1, 16]$:
$$\text{EnemySpeed}(S) = \text{BaseSpeed} \times \left(1 + 0.025 \times (S - 1)\right)$$
$$\text{MaxAggroRange}(S) = \min(10, \text{BaseRange} + \lfloor S / 3 \rfloor)$$

---

## 6. HTML Canvas & Pure CSS Cute Rendering System

To realize the cute aesthetic without external image files, each enemy is drawn dynamically via standard Canvas 2D methods.

### 6.1 Rendering Pipeline Architecture
```typescript
interface EnemyRenderContext {
  ctx: CanvasRenderingContext2D;
  x: number; // Center X coordinate in pixels
  y: number; // Center Y coordinate in pixels
  size: number; // Typically TILE_SIZE (40px)
  tick: number; // Game loop timestamp for oscillations
  state: string; // Current AI state
  facing: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  hitFlashTimer: number; // >0 if flashing white from damage
}

export function renderCuteEnemy(e: EnemyRenderContext, type: string) {
  const { ctx, x, y, size, tick, hitFlashTimer } = e;
  ctx.save();
  ctx.translate(x, y);

  // Hit flash shader effect
  if (hitFlashTimer > 0) {
    ctx.filter = 'brightness(2.5) drop-shadow(0 0 8px white)';
  }

  switch(type) {
    case 'SLIME_HOPPER': {
      const wobble = Math.sin(tick * 8) * 0.15;
      ctx.scale(1 - wobble, 1 + wobble);
      // Custard body shadow
      ctx.shadowColor = 'rgba(255, 180, 0, 0.4)';
      ctx.shadowBlur = 8;
      ctx.font = `${size * 0.85}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🍮', 0, 0);
      break;
    }
    case 'CHOCO_RUSHER': {
      if (e.state === 'SUGAR_CHARGE') {
        // Skew in direction of charge
        const skewX = e.facing === 'LEFT' ? 0.2 : e.facing === 'RIGHT' ? -0.2 : 0;
        ctx.transform(1, 0, skewX, 1, 0, 0);
        // Alert eye marker
        ctx.font = '12px bold sans-serif';
        ctx.fillStyle = '#FF3366';
        ctx.fillText('💢', 8, -16);
      }
      ctx.font = `${size * 0.85}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🍫', 0, 0);
      break;
    }
    case 'BERRY_GHOST': {
      const floatOffset = Math.sin(tick * 4) * 4;
      ctx.translate(0, floatOffset);
      ctx.globalAlpha = e.state === 'SHY_COVER_EYES' ? 0.35 : 0.9;
      ctx.shadowColor = 'rgba(255, 105, 180, 0.6)';
      ctx.shadowBlur = 12;
      ctx.font = `${size * 0.85}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.state === 'SHY_COVER_EYES' ? '🙈' : '🍓', 0, 0);
      break;
    }
    // (Render handlers for CLOUD_FLOATER, STAR_SEEKER, SLEEPY_SNAIL, BUBBLE_FISH, CANDY_THIEF)
  }

  ctx.restore();
}
```

---

## 7. Caveats
- **Phaser Physics vs Pure Tile Grid Alignment**: Current `GameScene.ts` uses Arcade Physics with continuous velocities (`setVelocityX(speed)`). If enemies switch between continuous movement and tile-based grid turns, they require a turn alignment helper (`Phaser.Math.Snap.To(val, TILE_SIZE)`) to avoid snagging on corridor corners.
- **Raycast Line of Sight**: `checkRaycastToPlayer` for Choco Rusher assumes clear cardinal lines. On mobile devices with 60 FPS budget, raycasts should only be calculated when the enemy reaches the center point of a tile, not on every frame.
- **Asset Fallback**: Unicode emoji appearance varies slightly across operating systems (iOS vs Android vs Windows). The Canvas renderer uses high-contrast drop shadows and pastel outline halos to maintain visual clarity regardless of OS emoji font differences.

---

## 8. Conclusion
The Normal Enemy suite achieves the ideal synthesis of **high tactical variety** and an **irresistibly cute aesthetic**:
1. **8 Archetypes** provide every foundational Bomberman mechanic: straightforward jumping (Slime Hopper), wall-phasing (Cloud Floater, Berry Ghost), high-speed corridor charging and bomb kicking (Choco Rusher), reactive evasion (Star Seeker), defensive armor and bulldozing (Sleepy Snail), projectile/bomb encapsulation (Bubble Fish), and item stealing/defusal (Candy Thief).
2. **Pure Canvas/Emoji Design** completely eliminates external sprite download overhead while delivering charming squash, stretch, wobble, and particle death animations.
3. **Structured Interaction Matrix** ensures clean, deterministic physics resolution for game logic implementers.

---

## 9. Verification Method
To independently verify and test these enemy mechanics:
1. **Inspect Handoff Specifications**:
   - Verify all 8 archetypes in `/Users/user/src/bomberman/.agents/explorer_enemies/handoff.md`.
   - Verify core attributes: HP, Speed relative to player (150 px/s), Bomb Interaction, Movement Algorithm, Death Mechanic, and Scaling Weights.
2. **Codebase Validation**:
   - Inspect existing baseline in `src/game/GameScene.ts` to confirm compatibility with `TILE_SIZE = 40`, `ROWS = 13`, `COLS = 15`.
   - Run linter/build verification:
     ```bash
     npm run lint
     npm run build
     ```
3. **Invalidation Conditions**:
   - Any enemy archetype exceeding player speed without warning windup.
   - Any mechanic requiring external raster assets contrary to the pure Canvas/Emoji requirement in `ORIGINAL_REQUEST.md`.
