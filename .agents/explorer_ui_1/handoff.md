# Handoff Report: UI Floating Text, Name Tags, Depth Hierarchy & Occlusion Architecture

**Explorer**: Explorer 2 (UI Depth & Text Occlusion)  
**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_ui_1`  
**Target Milestone**: Game Feel, Juice, UI Text Occlusion & Real-Time AI Overhaul  
**Date**: 2026-09-22  

---

## 1. Observation

### Obs 1: Static and Flat Depth Planes Across Entities and World Objects
Direct inspection of `setDepth` calls across the codebase revealed that visual depths are statically hardcoded at construction time without dynamic Y-sorting:
- `src/game/GameScene.ts:1220`: `bg.setDepth(-10);` (Background)
- `src/game/GameScene.ts:1574`: `floor.setDepth(0);` (Floor)
- `src/game/GameScene.ts:1580, 1587, 1609`: `wall.setDepth(1);`, `block.setDepth(1);` (Walls & Soft Blocks)
- `src/game/GameScene.ts:1640, 1646`: `portalA.setDepth(2);`, `portalB.setDepth(2);` (Portals)
- `src/game/GameScene.ts:3563`: `glow.setDepth(3);` (Item spawn glow)
- `src/game/GameScene.ts:3554`: `item.setDepth(4);` (Collectible items)
- `src/game/GameScene.ts:2537, 2633, 2712`: `bomb.setDepth(5);` (Bombs)
- `src/game/GameScene.ts:1658`: `this.telegraphGraphics.setDepth(5);` (Boss telegraph warnings)
- `src/game/GameScene.ts:1666`: `this.crisisGraphics.setDepth(6);` (Crisis ground hazards)
- `src/game/GameScene.ts:392`: `dot.setDepth(8);` (Path debug dots)
- `src/game/entities/BaseEntity.ts:51`: `this.setDepth(9);` (**All** dynamic enemies, neutrals, and allies)
- `src/game/GameScene.ts:1241`: `this.player.setDepth(10);` (Player character sprite)
- `src/game/GameScene.ts:2868`: `exp.setDepth(12);` (Explosion flames)
- `src/game/GameScene.ts:1660`: `this.bossGraphics.setDepth(15);` (Boss body graphics)
- `src/game/entities/OverheadUI.ts:56`: `this.hpGraphics.setDepth(16);` (Segmented HP bar)
- `src/game/entities/OverheadUI.ts:76`: `this.nameTag.setDepth(16);` (Overhead Name Tag text)
- `src/game/entities/OverheadUI.ts:89`: `this.indicator.setDepth(17);` (Overhead Intent Badge text)
- `src/game/GameScene.ts:3687`: `floating.setDepth(20);` (Floating text popup)

### Obs 2: Overhead UI Vertical Offsets & Hardcoded Coordinates
In `src/game/entities/OverheadUI.ts:26-30`:
```typescript
  // Offsets matching specification harness
  public readonly tier1_hp_y_offset = -14;
  public readonly tier2_name_y_offset = -22;
  public readonly tier3_intent_y_offset = -34;
```
And in `src/game/entities/OverheadUI.ts:110-118`:
```typescript
    const barX = this.x - this.barWidth / 2;
    const barY = this.y + this.tier1_hp_y_offset;

    if (this.nameTag && this.nameTag.active) {
      this.nameTag.setPosition(this.x, this.y + this.tier2_name_y_offset);
    }
    if (this.indicator && this.indicator.active) {
      this.indicator.setPosition(this.x, this.y + this.tier3_intent_y_offset);
    }
```
Every entity updates its overhead position strictly relative to its own `(x, y)` with zero awareness of neighboring entities, player proximity, or screen occlusions.

### Obs 3: Severe Disparity Between Grid Cell Size and Name Tag Dimensions
- Tile dimensions in `src/game/pathfinding.ts:7`: `TILE_SIZE = 40`.
- Character sprite visual size: 40x40 px with 24x24 px physics body (`BaseEntity.ts:52`, `GameScene.ts:1242`).
- Archetype names in `src/game/entities/types.ts:18, 30, 42, 54, 64, 77, 87, 100, 111, 122`:
  `'Chaser: Blinky'` (15 chars), `'Tank: Iron Golem'` (16 chars), `'Splitter: Gelatin'` (17 chars), `'Merchant: Pops'` (14 chars), `'Shield: Aegis'` (13 chars).
- Name tag font styling in `OverheadUI.ts:65-74`:
  `fontSize: '9px'`, `fontStyle: 'bold'`, `fontFamily: 'monospace, "Press Start 2P", Arial, sans-serif'`, `padding: { x: 3, y: 1 }`, `strokeThickness: 2`.
- In 9px bold monospace, a 16-character string spans approximately $16 \times 7\text{px} + 6\text{px} = 118\text{px}$.
- **118 pixels = nearly 3 full grid tiles wide (2.95 tiles)**.
- In a corridor or open room, any two entities within 2 tiles horizontally will suffer extensive name tag overlap (up to 78px of text collision).

### Obs 4: Vertical Occlusion of Upward (North) Entities by Downward (South) Labels
- Consider Entity A at `(x=200, y=220)` (South) and Entity B at `(x=200, y=180)` (North, exactly 1 tile away).
- Entity B's sprite spans `y ∈ [160, 200]`.
- Entity A's Overhead UI is located at:
  - Name Tag: `y = 220 - 22 = 198` (spans `y ∈ [192, 204]`, inside Entity B's feet/legs).
  - Intent Badge: `y = 220 - 34 = 186` (spans `y ∈ [179, 193]`, directly across Entity B's center).
- **Depth check**:
  - Entity B's sprite depth: `9` (`BaseEntity.ts:51`).
  - Entity A's name tag depth: `16` (`OverheadUI.ts:76`).
  - Entity A's intent badge depth: `17` (`OverheadUI.ts:89`).
- Because $17 > 16 > 9$, Entity A's overhead labels render **on top of** Entity B's character sprite.
- When Entity A is an enemy chasing the player from the south (`yEnemy = yPlayer + 35`), Entity A's intent badge (`depth 17`) renders directly over the Player sprite (`depth 10`).

### Obs 5: Floating Text Stacking and Collision
In `src/game/GameScene.ts:3677-3697`:
```typescript
  private spawnFloatingText(x: number, y: number, text: string, color: string) {
    const floating = this.add.text(x, y, text, {
      fontSize: '12px',
      fontStyle: 'bold',
      fontFamily: 'monospace, "Press Start 2P", Arial, sans-serif',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    });
    floating.setOrigin(0.5, 0.5);
    floating.setDepth(20);

    this.tweens.add({
      targets: floating,
      y: y - 22,
      alpha: 0,
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => floating.destroy(),
    });
  }
```
- Floating text is spawned at `(x, y - 8)` for item pickups (`GameScene.ts:3612`) and floats to `y - 30`.
- This trajectory directly cuts through the entity's Overhead UI area (`y - 14`, `y - 22`, `y - 34`).
- With `setDepth(20)`, floating text draws over all labels, sprites, and explosions.
- When multiple items are collected in rapid succession (e.g., via Magnet power-up or closely packed drops), all floating text instances spawn at the exact same coordinate without vertical staggering or queueing, stacking into an unreadable visual blob.

### Obs 6: Test Suite Invariants on OverheadUI
In `tests/entities_expansion.test.mjs:335-358` and `tests/entities_adversarial_stress.test.mjs:605-630`:
- `test('Tier 1 [UI]: 3-Tier Overhead UI component renders HP bar, name tag, and intent badge with exact vertical offsets')`
- The tests verify that `ui.getRenderLayers()` returns:
  - `layers.tier1_hp.y === y - 14`
  - `layers.tier2_name.y === y - 22`
  - `layers.tier3_intent.y === y - 34`
  - `clearance12 === 8`
  - `clearance23 === 12`
- Any architectural change to `OverheadUI` must preserve `getRenderLayers()` returning these default reference offsets to ensure 100% test compatibility across all 537 existing unit/adversarial tests.

---

## 2. Logic Chain

1. **Static Depth Assignment Causes Inverted Render Order**:
   - `BaseEntity` has fixed `depth = 9`, `Player` has fixed `depth = 10`.
   - Overhead UI has fixed `depth = 16` (HP/Name) and `depth = 17` (Badge).
   - In 2D top-down games, render order should be determined by vertical position ($y$ axis) to simulate 2.5D perspective.
   - Because depth is constant, Phaser sorts rendering strictly by display list order for entities of the same depth, and strictly by depth value for different depths.
   - Therefore, an Overhead UI at depth 16/17 will ALWAYS render in front of any sprite at depth 9 or 10, even when the sprite belongs to a character standing physically in front of or behind that label.

2. **Excessive Width + Dense Clustering Leads to Text Smearing**:
   - Monospace 9px font with full archetype names creates labels between 100px and 120px wide.
   - Corridors are 40px wide; entity collision boxes are 24px wide.
   - When 2 or 3 entities converge in a 2-tile radius (e.g. at a bomb choke point, boss encounter, or player cornering), their name tags overlap by 50% to 80% of their area.
   - Because all name tags share identical Y offsets (`y - 22`) and identical background styles (`rgba(15, 23, 42, 0.85)`), the text characters merge, creating an indecipherable black bar with scrambled letters.

3. **Lack of Entity-Level Coordinator Prevents Spatial Resolution**:
   - Because each `BaseEntity` calls `overheadUI.update(this.x, this.y, this.hp)` in its own update method, no entity knows where other entities' labels are located.
   - No repulsive force, no vertical stacking, and no alpha fading can occur without a unified pass across all active overhead UI components.

4. **Lack of Player Occlusion Guard Degrades Core Gameplay**:
   - The player character is the primary locus of attention.
   - Enemies chasing the player from the bottom-left, bottom, or bottom-right have their name tags positioned at `yEnemy - 22`.
   - When `yEnemy - yPlayer ∈ [15, 45]`, the enemy's name tag and intent badge sit directly on top of the player sprite.
   - Because enemy overhead UI has depth 16/17 while the player has depth 10, the player sprite is visually obliterated by the enemy's tag.

5. **Fire-and-Forget Floating Text Lacks Stacking Separation**:
   - `spawnFloatingText` lacks a vertical stacking offset or cooldown bucket.
   - Rapid item pickups produce identical-trajectory text tweens at depth 20, colliding with each other and with entity overhead UI.

---

## 3. Caveats

1. **Headless Test Invariants**:
   - Headless test suites (`tests/entities_expansion.test.mjs` and `tests/entities_adversarial_stress.test.mjs`) instantiate `OverheadUI` with `scene = null` and invoke `getRenderLayers()`.
   - Architectural enhancements (decluttering, dynamic offsets, opacity lerping) must operate on the Phaser display objects (`nameTag`, `hpGraphics`, `indicator`) when `scene` is present, while preserving default reference values in `getRenderLayers()` to prevent breaking headless unit test contracts.

2. **Phaser Text Allocation & Performance**:
   - Recreating `Phaser.GameObjects.Text` every frame causes garbage collection pauses.
   - Any dynamic repositioning or text changes must mutate existing text objects (`setPosition`, `setText`, `setAlpha`) rather than instantiating new objects.

3. **Boss HUD Isolation**:
   - The primary Boss HP and threat alerts are rendered in React (`BossHUD` -> `BombermanGame.tsx`).
   - In-world entities during boss fights (minions, player, allies) still use `OverheadUI`. Their depths must not render on top of the boss body graphics (`depth 15`).

---

## 4. Conclusion & Architectural Solutions

To permanently eliminate name tag overlap, character occlusion, and floating text clashing, four coordinated architectural subsystems are recommended:

### Architecture 1: Unified 2.5D Depth Band Hierarchy (`RENDER_DEPTH`)
Replace fragmented magic numbers with a standardized continuous depth band:

```typescript
export const RENDER_DEPTH = {
  // Ground Layers
  BACKGROUND: -10,
  FLOOR: 0,
  WALLS: 1,
  BLOCKS: 2,
  DECALS: 3,
  PORTALS: 4,
  ITEM_GLOW: 5,
  ITEMS: 6,
  BOMBS: 7,
  TELEGRAPHS: 8,
  CRISIS_HAZARDS: 9,

  // Dynamic Y-Sorted Band (100 to 700 based on screen Y)
  // depth = ENTITY_Y_BASE + y * Y_SCALE + OFFSET
  ENTITY_Y_BASE: 100,
  ENTITY_Y_SCALE: 1.0,
  OFFSET_SHADOW: -0.1,
  OFFSET_SPRITE: 0.0,
  OFFSET_SHIELD: 0.1,
  OFFSET_HP_BAR: 0.2,
  OFFSET_NAME_TAG: 0.3,
  OFFSET_INTENT_BADGE: 0.4,

  // World Visual Effects (Always above ground entities)
  EXPLOSIONS: 750,
  SHOCKWAVES: 760,
  DEBRIS_PARTICLES: 770,

  // Boss Graphics Layer
  BOSS_BODY: 800,
  BOSS_VFX: 810,

  // Floating Labels & Popups
  FLOATING_TEXT: 900,
  SCREEN_OVERLAY: 950,
} as const;
```

**Key Benefit**:
- All entities and their overhead labels dynamically update depth based on their physical $Y$ coordinate:
  `const baseDepth = RENDER_DEPTH.ENTITY_Y_BASE + this.y;`
  `this.setDepth(baseDepth + RENDER_DEPTH.OFFSET_SPRITE);`
  `this.overheadUI.setDepth(baseDepth);`
- An entity higher on the screen (farther back) is naturally occluded by an entity lower on the screen (closer to the front).
- Explosion flames (depth 750) engulf both the sprite and its overhead labels during detonation.
- Boss graphics (depth 800) are never occluded by minion overhead labels.

---

### Architecture 2: `OverheadUIManager` (Scene-Level Declutter Engine)
Implement a centralized `OverheadUIManager` in `GameScene.ts` executed once per frame after all entities have stepped:

1. **Spatial Proximity & Label Collision Detection**:
   - Collect all active `OverheadUI` instances into a flat array.
   - For each label $i$ and $j$, evaluate AABB intersection:
     $$\Delta x = |x_i - x_j| < \frac{w_i + w_j}{2} + 4\text{px}$$
     $$\Delta y = |y_i - y_j| < 16\text{px}$$

2. **Horizontal Spring Repulsion**:
   - When horizontal overlap occurs ($\Delta x > 0$), apply a horizontal nudge $\pm \frac{\Delta x}{2}$ to separate the two labels horizontally.
   - Clamp adjusted coordinates within grid bounds ($[20, \text{ARENA\_WIDTH} - 20]$).

3. **Vertical Staggering (Upper/Lower Split)**:
   - If two entities are too close horizontally ($|x_i - x_j| < 24\text{px}$), horizontal repulsion would push labels too far from the character.
   - In this scenario, assign the northern entity the standard overhead offset (`y - 22`) and the southern entity an under-foot offset (`y + 24`) or elevated tier (`y - 36`).

4. **Adaptive Name Tag LOD (Level of Detail)**:
   - **Solo Mode** (distance to nearest entity $> 70\text{px}$):
     Display full name (e.g., `'Chaser: Blinky'`).
   - **Clustered Mode** (distance to nearest entity $\le 70\text{px}$):
     Display compact nickname only (e.g., `'Blinky'`, reducing label width by $>50\%$).
   - **Dense Melee Mode** (3+ entities within $60\text{px}$):
     Temporarily hide text name tags, displaying only the 24px HP bar and Intent emoji badge.

---

### Architecture 3: Proximity-Based Opacity Fading & Player Protection Bubble

1. **Player Sprite Protection Bubble**:
   - Define a circular exclusion zone around the player: $R_{\text{player}} = 38\text{px}$.
   - For any entity label whose visual center falls within $R_{\text{player}}$ of `(player.x, player.y)`:
     - Apply smooth alpha decay down to $0.15$ (or $0.0$ if within $20\text{px}$).
     - The player sprite remains 100% visible and unoccluded at all times.

2. **Mutual Label Proximity Fading**:
   - When two entities are within $40\text{px}$ of each other, fade the lower-priority entity's name tag to $\alpha = 0.35$ while keeping the HP bar at $\alpha = 0.85$.
   - Priority hierarchy: Player proximity > Allies > High-tier Enemies (Bosses/Tanks) > Minions/Critters.

3. **Smooth Exponential Lerp**:
   - Smooth alpha adjustments frame-over-frame:
     $$\alpha_{t} = \alpha_{t-1} + (\alpha_{\text{target}} - \alpha_{t-1}) \times \min(1.0, \Delta t \times 0.015)$$
   - Prevents visual popping or flashing.

---

### Architecture 4: Staggered Floating Text Queue (`FloatingTextManager`)
Refactor `spawnFloatingText` into a managed, collision-free text cascade:

1. **Active Popup Tracking**:
   - Maintain a list of active floating texts with their current positions and spawn timestamps.
2. **Vertical Cascade Stacking**:
   - When a new popup is requested within $30\text{px}$ of an active popup spawned in the last $450\text{ms}$:
     $$y_{\text{spawn}} = y_{\text{base}} - (\text{activeCount} \times 16\text{px})$$
   - Multiple pickups cascade neatly upwards in sequence instead of stacking on the same pixel.
3. **Dedicated Floating Depth**:
   - Floating popups use `RENDER_DEPTH.FLOATING_TEXT` ($900$), floating above all entities and world objects with high-contrast 3px stroke.

---

## 5. Verification Method

### Independent Verification Steps
1. **Automated Test Suite Verification**:
   Execute the full test suite to ensure zero regressions in existing entity and overhead UI logic:
   ```bash
   cd /Users/user/src/bomberman
   npm test
   ```
   **Expected**: All 537 existing tests pass (0 failures, 0 regressions).

2. **Headless OverheadUI Layout Verification**:
   Run the dedicated entity test suites:
   ```bash
   node --test tests/entities_expansion.test.mjs tests/entities_adversarial_stress.test.mjs
   ```
   **Expected**: `getRenderLayers()` maintains exact offsets (`-14`, `-22`, `-34`) and clearances (`8`, `12`).

3. **Static Analysis & Lint Check**:
   ```bash
   npm run lint
   ```
   **Expected**: 0 ESLint errors and 0 warnings.

4. **Production Build Verification**:
   ```bash
   npm run build
   ```
   **Expected**: Clean compilation with exit code 0.

5. **Visual Cluster Inspection (Live Browser Test)**:
   In Chrome DevTools or live browser session:
   - Spawn 5 enemies and observe them clustering around the player or blocks.
   - Verify that:
     1. Name tags do not overlap into unreadable text blocks (compact mode or horizontal separation engaged).
     2. Enemies south of the player do not cover the player sprite (player protection bubble fades labels to $\alpha \le 0.2$).
     3. Picking up multiple items in rapid succession creates a vertically staggered cascade of text rather than a stacked blob.
     4. Explosion flames cleanly render over damaged entities and their overhead labels.

---
*Report generated and authored by Explorer 2.*
