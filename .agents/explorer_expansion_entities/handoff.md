# Handoff Report: Diverse Entity Ecosystem & AI Architecture

**Agent**: `explorer_expansion_entities`  
**Milestone**: Massive Scale Expansion Phase (Diverse Entities Ecosystem)  
**Date**: 2026-09-15T07:18:00Z  
**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_expansion_entities/`

---

## 1. Observation

Direct code examination of the existing Bomberman codebase revealed the following structural foundations:

1. **Current Enemy Implementation (`src/game/GameScene.ts`)**:
   - Lines 85–163: A single `Enemy` class extends `Phaser.Physics.Arcade.Sprite` with 8 states:
     ```ts
     export enum EnemyState {
       IDLE = 'IDLE',
       PATROL = 'PATROL',
       TRACKING = 'TRACKING',
       HUNTING = 'HUNTING',
       WINDUP = 'WINDUP',
       ATTACK = 'ATTACK',
       COOLDOWN = 'COOLDOWN',
       EVADING = 'EVADING',
     }
     ```
   - Lines 99–103 & Lines 134–160: Existing 2-tier overhead UI consisting of:
     - Tier 1 (y - 19): Name Tag text (`nameTag`) with dark background `rgba(15, 23, 42, 0.85)` and color `#fb923c` or `#38bdf8`.
     - Tier 2 (y - 33): Intent Indicator text (`indicator`) rendering glyphs `!`, `⚠️`, `⚡`, `💫`, `💨`, `...`.
     - **Gap**: There is currently NO health bar component. All entities die in 1 hit upon explosion overlap.
   - Lines 1071–1076:
     ```ts
     this.physics.add.overlap(this.enemies, this.explosions, (enemyObj) => {
       const target = enemyObj as Phaser.GameObjects.GameObject;
       if (target.active) {
         target.destroy();
       }
     });
     ```
     Any explosion overlap destroys enemies unconditionally.

2. **Existing Pathfinding & Escape Algorithms (`src/game/pathfinding.ts`)**:
   - Lines 18–93: `findPathBFS(start, target, map, bombTiles)` computes shortest Manhattan/BFS corridor route avoiding `TILE_WALL`, `TILE_BLOCK`, and active bombs.
   - Lines 102–131: `getBlastTiles(center, power, map)` performs 4-directional raycasting to identify all danger coordinates.
   - Lines 139–203: `findEscapePathBFS(start, dangerTiles, map, existingBombs, maxSteps)` calculates shortest path to nearest safe tile outside danger zones within `maxSteps` (default 4).

3. **Current Spawning & Faction Constraints (`src/game/GameScene.ts`)**:
   - Lines 1090–1119: `spawnEnemies(count)` only differentiates `isTracker` (odd/even) with `'enemy_tracker'` vs `'enemy'`.
   - Lines 1616–1624: Global active enemy bomb limit is enforced at maximum 2 across the arena (`owner === 'enemy'`).
   - Lines 1858–1863: Block destruction has 45% drop rate with 600ms grace period (`isItemProtectedFromExplosion`) protecting items from blast destruction.

4. **Test Suite Baseline (`package.json` & `npm test`)**:
   - 154 automated tests across 11 suites pass cleanly with 0 failures in ~107ms (`npm test`).
   - Strict invariants verified: Suicide prevention (dead-ends reject bomb placement), isolated bomb capacities, 14px vertical UI clearance, corridor centering convergence.

---

## 2. Logic Chain

From the observations above:
1. **Multi-Hit & Health Bar Need**: Because currently `target.destroy()` occurs on the first explosion overlap (Observation 1), introducing diverse enemy archetypes like Tanks (4 HP), Bombers (2 HP), or Bosses/Splitters requires:
   - An entity HP tracking property (`hp`, `maxHp`).
   - Invulnerability frames (i-frames e.g., 800–1200ms) with sprite flashing so an explosion persisting over 320ms does not deal damage every frame.
   - A dedicated 3-tier Overhead UI component (`hpBarGraphics` at y - 12, `nameTag` at y - 20, `indicator` at y - 32) replacing the 2-tier system.
2. **Pathfinding Extension for Archetypes**:
   - **Ghost**: Must treat `TILE_BLOCK` as passable in `findPathBFS`, while still respecting `TILE_WALL` outer borders and pillars (Observation 2).
   - **Tank**: Moves directly toward player, pulverizing `TILE_BLOCK` upon physical collision using `destroyBlock(r, c)`.
   - **Splitter**: On reaching 0 HP, intercepts `destroy()` to spawn 2 mini-slimes at adjacent free orthogonal tiles.
3. **Faction & Ally Invariants**:
   - Adding Allies (`Mini-Bomber Buddy`, `Pet Drone`, `Shield Guard`) requires a faction system (`'player' | 'ally' | 'neutral' | 'enemy'`).
   - To guarantee zero friendly fire, the explosion overlap handler must check `bomb.getData('owner')`:
     - Player/Ally explosions damage Enemies and Neutrals, but NEVER Player or Allies.
     - Enemy explosions damage Player, Allies, and Neutrals, but NOT Enemies.
   - Ally bomb placement must simulate player position and pathing to ensure the blast zone never engulfs the player.
4. **Architectural Separation**:
   - Placing all entity logic inside `GameScene.ts` (already 2,200+ lines) creates tight coupling and maintenance hazards.
   - Abstracting entities into `src/game/entities/` (`BaseEntity`, `EnemyEntity`, `NeutralEntity`, `AllyEntity`, `OverheadUI`) allows modular scalability, independent unit testing, and clean scene lifecycle management.

---

## 3. Comprehensive Entity & AI System Specification

### 3.1 Five Distinct Enemy Types

| Enemy Type | Max HP | Move Speed | FSM States | Attack / Unique Behavior | Visual Palette & Features | Overhead 3-Tier UI |
|---|---|---|---|---|---|---|
| **Chaser**<br>(Blinky / Stalker) | 1 HP | Patrol: 70 px/s<br>Track: 110 px/s<br>Dash: 240 px/s | `IDLE`<br>`PATROL`<br>`TRACKING`<br>`WINDUP`<br>`ATTACK`<br>`COOLDOWN` | **Pounce Dash**: Rapid BFS recalculation every 200ms. When in corridor line-of-sight ($\le 4$ tiles), telegraphs 350ms and lunges forward at 240 px/s. Stunned 900ms on wall impact. | Crimson/Scarlet (`0xff4444`). Flame ember trail particles (`0xff6622`). Angry horn silhouette. | **T1**: 1-segment Red (`#ef4444`)<br>**T2**: "Chaser: Blinky" (`#fb923c`)<br>**T3**: `!` / `⚠️` / `⚡` / `💫` |
| **Bomber**<br>(Pyro / Boomer) | 2 HP | Patrol: 60 px/s<br>Track: 80 px/s<br>Evade: 95 px/s<br>Enraged: 105 px/s | `IDLE`<br>`PATROL`<br>`HUNTING`<br>`PLANTING`<br>`EVADING`<br>`ENRAGED` | **Strategic Trap**: Plants purple bombs (`0xd946ef`) near bottlenecks/blocks ONLY when `findEscapePathBFS()` guarantees safe escape. At 1 HP, enters Enraged mode: plants quick-fuse bombs (1.2s fuse). | Amethyst/Violet (`0xc084fc`). Glowing overhead wick spark (`0xfde047`). Pulsing magenta at 1 HP (`0xec4899`). | **T1**: 2-segment Amber/Red (`#eab308`)<br>**T2**: "Bomber: Pyro" (`#c084fc`)<br>**T3**: `💣` / `💨` / `😈` / `⚠️` |
| **Tank**<br>(Iron Golem / Grumble) | 4 HP | Walk: 45 px/s<br>Enraged Charge: 130 px/s | `PATROL`<br>`BULLDOZING`<br>`STOMP`<br>`HURT_STUN`<br>`ENRAGED_CHARGE` | **Block Crusher & Heavy Armor**: Takes only 1 HP damage per blast with 1200ms i-frames. Walks straight through `TILE_BLOCK`, shattering them into debris. Ground stomp slows player by 30% for 1.5s if in same corridor. | Slate Steel (`0x64748b`). Scaled 1.2x (28x28 hitbox). Metallic clank sparks on impact (`0xe2e8f0`). | **T1**: 4-segment Steel Blue (`#38bdf8`)<br>**T2**: "Tank: Iron Golem" (`#94a3b8`)<br>**T3**: `🛡️` / `🔨` / `💥` / `💢` |
| **Ghost**<br>(Phantasm / Spook) | 1 HP | Phasing: 65 px/s<br>Phase Dash: 260 px/s | `PHASING`<br>`STALKING`<br>`ETHER_DASH`<br>`MATERIALIZED` | **Block Phasing & Ether Dash**: Pathfinding ignores `TILE_BLOCK`, floating straight through soft walls. Can burst dash through blocks at player. After dashing, materializes (alpha 1.0) for 1500ms making it vulnerable. | Ethereal Cyan (`0x67e8f9`) with alpha 0.65. Up-and-down floating sine wave tween. Spectral tail particles. | **T1**: 1-segment Aqua (`#06b6d4`)<br>**T2**: "Ghost: Phantasm" (`#22d3ee`)<br>**T3**: `👻` / `⚡` / `👁️` |
| **Splitter**<br>(Gelatin / Slime King) | Parent: 2 HP<br>Mini: 1 HP | Parent: 60 px/s<br>Mini: 100 px/s | `BOUNCING`<br>`HUNTING`<br>`SPLITTING`<br>`MINI_SCATTER` | **Division on Defeat**: Gelatinous blob that squashes and stretches. When parent is eliminated, divides into 2 fast Mini-Slimes that scatter to adjacent open tiles and flank player. | Emerald Green (`0x22c55e`, 1.15x scale). Mini-Slimes are Bright Lime (`0x84cc16`, 0.7x scale). Goo splash particles (`0x4ade80`). | **T1**: 2-segment Emerald (`#10b981`)<br>**T2**: "Splitter: Gelatin" (`#4ade80`)<br>**T3**: `🟢` / `➗` / `🏃` |

---

### 3.2 Neutral NPCs (Wandering Merchant & Critters)

1. **Wandering Merchant ("Pops the Trader")**:
   - **HP**: 3 HP (Reinforced trade wagon).
   - **Movement**: Peaceful stroll at 40 px/s. High-priority flee behavior when bombs tick within 3 tiles. Pauses at corridor intersections for 2.5s to set up a trade cart (`TRADE_STALL`).
   - **Interaction & Mechanics**:
     - Touching or standing adjacent reveals an overhead indicator: `[E] Trade` / `💰`.
     - Player can trade surplus collected items (e.g., 2 Speed Ups for 1 Shield or Bomb Up) or high score points.
     - **Protection Reward**: If protected from damage for 30 seconds or until round completion, rewards player with 2 rare power-ups!
     - **Cart Break**: If destroyed by bomb blasts, the merchant vanishes in a puff of smoke, spilling 1–2 random power-ups across neighboring tiles (protected by 600ms grace period).
   - **Overhead UI**:
     - Tier 1: 3-segment Golden Amber Bar (`#f59e0b`).
     - Tier 2: "Merchant: Pops" (`#fbbf24`).
     - Tier 3: `💰` (Trade Ready) / `🛒` (Wandering) / `😱` (Fleeing).

2. **Wandering Critters ("Forest Piggles / Dust Bunnies")**:
   - **HP**: 1 HP (Peaceful ambient wildlife).
   - **Movement**: Gentle hopping at 35 px/s with a cute squash-and-stretch waddle. Pauses for 1.5s to nibble grass.
   - **Interaction**:
     - Completely harmless to player (touching does not damage player; player slides past and gets a heart emoji `💖`).
     - Decoy function: Enemies in `HUNTING` state have a 25% chance to be momentarily distracted by a nearby critter for 1s.
     - When popping from blast, releases heart particles and grants +200 bonus score.
   - **Overhead UI**:
     - Tier 1: Small single pink pip (`#ec4899`).
     - Tier 2: "Critter: Fluff" (`#f472b6`).
     - Tier 3: `💤` (Sleeping/Nibbling) / `💖` (Petted) / `🐾` (Hopping).

---

### 3.3 AI-Controlled Allies

1. **Mini-Bomber Buddy ("Pom-Pom")**:
   - **Health**: 3 HP (Cyan health bar). Lasts 45s or until defeated.
   - **AI Logic**:
     - **Dynamic Leash**: Follows 2–3 tiles behind player. Sprints at 160 px/s if distance exceeds 6 tiles.
     - **Friendly-Fire Invariant**: Evaluates candidate bomb tiles using `getBlastTiles()`. Rejects placement if the player's current tile or immediate heading tile is within the blast danger zone!
     - **Enemy Demolition**: Drops cyan-pulsing bombs (`0x06b6d4`, 2-tile power) near enemy corridors and safely flees along `findEscapePathBFS()`.
   - **Overhead UI**: Tier 1: 3-segment Cyan Bar (`#06b6d4`); Tier 2: "Ally: Pom-Pom" (`#22d3ee`); Tier 3: `🛡️` (Guarding) / `🎯` (Targeting) / `💣` (Planting).

2. **Pet Drone ("Aero-Bot / Gizmo")**:
   - **Health**: 2 HP (Rechargeable energy shield; regenerates 1 HP every 10s).
   - **AI Logic**:
     - **Hover & Flight**: Ignores floor obstacles, flying smoothly at 120 px/s. Orbits player at 32px radius.
     - **Item Fetcher**: Scans a 6-tile radius for uncollected power-up items. Uses a tractor beam to collect and deliver them to the player.
     - **Stun Peashooter**: Fires a micro plasma bolt at nearest enemy every 3s, dealing 1 damage or applying 1.0s stun `💫`.
     - **Danger Radar**: Pings player with a warning siren `⚠️` if player stands in an active bomb blast zone.
   - **Overhead UI**: Tier 1: 2-segment Electric Blue Bar (`#38bdf8`); Tier 2: "Drone: Gizmo" (`#67e8f9`); Tier 3: `🚁` (Orbit) / `🧲` (Fetching) / `🎯` (Firing).

3. **Shield Guard ("Aegis Knight")**:
   - **Health**: 5 HP (Sturdy paladin construct).
   - **AI Logic**:
     - **Vanguard March**: Positions itself 1 tile ahead of player along movement heading.
     - **Taunt Aura**: Emits an aggro wave every 4s that forces enemies within 5 tiles in `TRACKING` state to target Aegis instead of player.
     - **Aegis Dome**: When a bomb ticks within 2 tiles of player, plants its shield to project a 1-tile radiant dome absorbing the explosion hit.
   - **Overhead UI**: Tier 1: 5-segment Royal Blue Bar (`#3b82f6`); Tier 2: "Ally: Aegis" (`#60a5fa`); Tier 3: `🛡️` (Guarding) / `📢` (Taunting) / `✨` (Dome Active).

---

### 3.4 Architecture & Class Hierarchy in `src/game/`

```
src/game/
├── pathfinding.ts                # BFS navigation, blast raycasting, escape BFS
├── gameplay_mechanics.ts         # Items, drop tables, stat mutators, grace window
├── entities/
│   ├── BaseEntity.ts             # Abstract entity (Sprite + HP + Faction + OverheadUI)
│   ├── OverheadUI.ts             # Reusable 3-tier overhead graphics component
│   ├── enemies/
│   │   ├── ChaserEnemy.ts        # Fast BFS tracker with pounce dash
│   │   ├── BomberEnemy.ts        # Strategic bomb placer with suicide prevention
│   │   ├── TankEnemy.ts          # 4 HP armored block crusher
│   │   ├── GhostEnemy.ts         # Translucent soft-block phaser
│   │   └── SplitterEnemy.ts      # Gelatinous slime dividing into mini-slimes
│   ├── neutrals/
│   │   ├── MerchantNPC.ts        # Wandering trader with stall & protective drop
│   │   └── CritterNPC.ts         # Peaceful ambient hopping wildlife
│   └── allies/
│       ├── MiniBomberAlly.ts     # Leashed bomb buddy with friendly-fire safety
│       ├── DroneAlly.ts          # Flying item fetcher & plasma peashooter
│       └── ShieldGuardAlly.ts    # Aggro magnet & Aegis blast shield protector
└── GameScene.ts                  # Orchestrates physics groups, maps, and events
```

#### Detailed Class Specifications

##### 1. `OverheadUI` Component (`src/game/entities/OverheadUI.ts`)
```ts
export type EntityFaction = 'player' | 'enemy' | 'neutral' | 'ally';

export class OverheadUI {
  private scene: Phaser.Scene;
  private hpGraphics: Phaser.GameObjects.Graphics;
  private nameTag: Phaser.GameObjects.Text;
  private indicator: Phaser.GameObjects.Text;
  private barWidth: number;
  private barHeight: number = 4;

  constructor(
    scene: Phaser.Scene,
    name: string,
    faction: EntityFaction,
    maxHp: number,
    barWidth: number = 24
  ) {
    this.scene = scene;
    this.barWidth = barWidth;

    // Tier 1: HP Bar (Graphics at y - 12)
    this.hpGraphics = scene.add.graphics();
    this.hpGraphics.setDepth(16);

    // Tier 2: Name Tag (y - 20)
    const nameColor = faction === 'enemy' ? '#fb923c' : faction === 'ally' ? '#22d3ee' : '#fbbf24';
    this.nameTag = scene.add.text(0, 0, name, {
      fontSize: '9px',
      fontStyle: 'bold',
      fontFamily: 'monospace, Arial, sans-serif',
      color: nameColor,
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      padding: { x: 3, y: 1 },
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(16);

    // Tier 3: Intent Badge (y - 32)
    this.indicator = scene.add.text(0, 0, '', {
      fontSize: '13px',
      fontStyle: 'bold',
      fontFamily: 'monospace, Arial, sans-serif',
    }).setOrigin(0.5, 0.5).setDepth(17).setVisible(false);
  }

  public update(x: number, y: number, currentHp: number, maxHp: number, faction: EntityFaction) {
    // 1. Position sync
    const barX = x - this.barWidth / 2;
    const barY = y - 14;
    this.nameTag.setPosition(x, y - 22);
    this.indicator.setPosition(x, y - 34);

    // 2. Render HP Bar Segments
    this.hpGraphics.clear();
    // Background bar
    this.hpGraphics.fillStyle(0x0f172a, 0.85);
    this.hpGraphics.fillRect(barX - 1, barY - 1, this.barWidth + 2, this.barHeight + 2);

    // Fill bar
    const fillRatio = Math.max(0, Math.min(1, currentHp / maxHp));
    const fillColor = faction === 'enemy' 
      ? (fillRatio > 0.5 ? 0xef4444 : 0xb91c1c)
      : faction === 'ally' ? 0x06b6d4 : 0xf59e0b;

    this.hpGraphics.fillStyle(fillColor, 1.0);
    this.hpGraphics.fillRect(barX, barY, this.barWidth * fillRatio, this.barHeight);

    // Segment dividers for multi-HP entities
    if (maxHp > 1) {
      this.hpGraphics.lineStyle(1, 0x000000, 0.8);
      for (let i = 1; i < maxHp; i++) {
        const segX = barX + (this.barWidth / maxHp) * i;
        this.hpGraphics.lineBetween(segX, barY, segX, barY + this.barHeight);
      }
    }
  }

  public setIntent(glyph: string, visible: boolean = true) {
    if (!this.indicator.active) return;
    this.indicator.setText(glyph).setVisible(visible);
  }

  public destroy() {
    this.hpGraphics.destroy();
    this.nameTag.destroy();
    this.indicator.destroy();
  }
}
```

##### 2. `BaseEntity` Class (`src/game/entities/BaseEntity.ts`)
```ts
export abstract class BaseEntity extends Phaser.Physics.Arcade.Sprite {
  public hp: number;
  public maxHp: number;
  public faction: EntityFaction;
  public overheadUI!: OverheadUI;
  public invulnerableTimer: number = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    faction: EntityFaction,
    maxHp: number,
    name: string,
    barWidth: number = 24
  ) {
    super(scene, x, y, texture);
    this.faction = faction;
    this.maxHp = maxHp;
    this.hp = maxHp;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setDepth(9);

    this.overheadUI = new OverheadUI(scene, name, faction, maxHp, barWidth);
  }

  public takeDamage(amount: number, source: string): boolean {
    if (!this.active || this.hp <= 0 || this.invulnerableTimer > 0) return false;

    this.hp = Math.max(0, this.hp - amount);
    this.invulnerableTimer = 800; // 800ms hit grace i-frame

    // Tactile hit flash tween
    if (this.scene) {
      this.scene.tweens.add({
        targets: this,
        alpha: 0.3,
        yoyo: true,
        repeat: 3,
        duration: 100,
        onComplete: () => {
          if (this.active) this.setAlpha(1.0);
        },
      });
    }

    if (this.hp <= 0) {
      this.onDeath(source);
      return true;
    }
    return false;
  }

  protected onDeath(_source: string): void {
    this.destroy();
  }

  public override destroy(fromScene?: boolean): void {
    if (this.overheadUI) {
      this.overheadUI.destroy();
    }
    super.destroy(fromScene);
  }
}
```

---

### 3.5 Collision & Physics Interaction Matrix

The table below details all collision rules to be registered in `GameScene.create()`:

| Interaction Pair | Physics Method | Handler Logic | Invariants |
|---|---|---|---|
| **Player vs Enemy** | `overlap` | Player calls `playerDie()` (absorbs with shield if active). | Dash invulnerability prevents damage. |
| **Player vs Ally** | None / Pass-through | No physical blocking. Soft separation vector if occupying identical tile. | Zero player snagging. |
| **Player vs Neutral** | `overlap` | Interacts (opens trade prompt or pets critter). Zero damage. | Friendly & non-blocking. |
| **Ally vs Enemy** | `overlap` | Enemy attacks Ally; Ally takes 1 HP damage. Stun/knockback applied. | Protects player from body blocking. |
| **Bomb vs All Entities** | `collider` with pass-through check | Impassable solid obstacle once entity steps off bomb tile. Sliding bomb kicks explode on enemy impact. | Stepping-off passability preserved. |
| **Explosion vs Enemy** | `overlap` | Calls `enemy.takeDamage(1, 'explosion')`. Multi-HP enemies flash and lose 1 HP. | Prevents 1-frame multi-hit elimination via i-frame timer. |
| **Explosion vs Ally** | `overlap` | Checks bomb owner. If owner is `'player'` or `'ally'`: ZERO damage. If owner is `'enemy'`: takes 1 HP damage. | **Strict friendly-fire elimination**. |
| **Explosion vs Neutral** | `overlap` | Takes 1 HP damage. Merchant cart bursts if destroyed, spilling loot protected by 600ms grace period. | Item grace period preserved. |

---

## 4. Caveats

1. **Sprite Asset Availability**:
   - Currently, `public/assets/` contains `player.png` (spritesheet), `enemy.png`, `enemy_tracker.png`, `bomb.png`, `explosion.png`, `wall.png`, `block.png`, `floor.png`.
   - The new variants (Tank, Ghost, Splitter, Merchant, Allies) should utilize dynamic Phaser tinting, scaling, and procedural canvas generation (or additional spritesheets via `scripts/generate-assets.sh`) to prevent missing asset 404 errors.
2. **Performance with Swarms**:
   - Running BFS pathfinding for 15+ simultaneous entities every frame would degrade performance on mobile.
   - Mitigation: BFS recalculation must be staggered (interleaved across entity frames, e.g. every 250–350ms per entity, or cached).
3. **Phaser Physics Group Pooling**:
   - To maintain high 60fps rendering, create separate physics groups: `this.enemies`, `this.allies`, `this.neutrals`, allowing clean group-level collision bindings.

---

## 5. Conclusion

This design establishes a scalable, clean, and bug-free entity foundation for Bomberman:
- **5 Diverse Enemy Archetypes** (Chaser, Bomber, Tank, Ghost, Splitter) with distinct FSM states, speeds, HPs, and tactical mechanics.
- **2 Neutral NPC Categories** (Wandering Merchant with trade/protection incentives, Ambient Critters for liveliness).
- **3 AI-Controlled Allies** (Mini-Bomber Buddy with strict friendly-fire prevention, Pet Drone for item retrieval and stun darts, Shield Guard for taunting and Aegis bubble shielding).
- **Composite 3-Tier Overhead UI** (`OverheadUI`) combining segmented HP bar, faction-colored name tag, and dynamic intent glyphs with 100% leak-free destruction.
- **Clean Faction Collision Matrix** guaranteeing safety, zero friendly fire, and compliance with the project's 600ms item grace period and corridor-sliding algorithms.

---

## 6. Verification Method

To independently verify this specification and its future implementation:
1. **Automated Unit & Stress Testing**:
   - Run project test runner:
     ```bash
     npm test
     ```
     Ensure all existing 154 tests continue to pass with 0 regressions.
   - Add new test suite `tests/entities_expansion_stress.test.mjs` verifying:
     - Multi-hit HP reduction and i-frame invulnerability on Tank and Bomber.
     - Splitter death division into 2 Mini-Slimes at valid open coordinates.
     - Ghost pathfinding ignoring breakable blocks while halting at outer walls.
     - Ally friendly-fire safety: player explosion overlap produces zero damage on `MiniBomberAlly`.
     - Suicide prevention invariant: Bomber and Mini-Bomber refuse bomb placement when no escape tile exists within 4 steps.
     - Leak-free destruction: destroying an entity cleans up `hpGraphics`, `nameTag`, and `indicator`.
2. **Static Analysis & Build Verification**:
   - Run ESLint:
     ```bash
     npm run lint
     ```
   - Run Next.js production build:
     ```bash
     npm run build
     ```
     Confirm compilation succeeds with exit code 0.
