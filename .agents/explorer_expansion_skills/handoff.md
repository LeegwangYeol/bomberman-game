# Ultimate Skills (필살기), Resource/Gauge Systems, Screen VFX, and Audio-Visual Impact Report

**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_expansion_skills/`  
**Date**: 2026-09-15  
**Mission**: Comprehensive Architectural Specification & Design Document for Bomberman Ultimate Skills (필살기), 100-Point Resource Charging Systems, Non-Linear Screen VFX/Sensual Feedback, and React HUD / Mobile Touch Integration.

---

## 1. Observation

### 1.1 Existing Architecture & Codebase Baseline
Direct inspection of the current repository files reveals the existing system topology:

1. **`src/game/GameScene.ts`**:
   - **Physics & Dimensions**: Tile size is 40px (`TILE_SIZE = 40`), grid is 13 rows by 15 columns (`ROWS = 13, COLS = 15`). Player body size is clamped to `24x24` with `8,8` offset (lines 126–127, 850–870).
   - **Camera Feedback**: Linear camera shake is currently triggered during bomb explosions (line 1724: `this.cameras.main.shake(150, 0.008);`) and shield absorption (line 1873: `this.cameras.main.shake(120, 0.01);`).
   - **Camera Flash**: Flash overlays are used sparsely (line 1727: `this.cameras.main.flash(80, 255, 230, 160, false);` for explosions, and line 2001 for portal warps).
   - **Shockwaves**: A single procedural graphic shockwave ring exists in `explodeBomb` (lines 1732–1748) expanding via `this.tweens.addCounter` from 0 to 1 over 220ms with stroke circle.
   - **Active Skills**: Currently limited to **Bomb Kick** (`hasKick: boolean`, sliding physics in lines 1900–1930) and **Dash** (`isDashing`, `dashCooldownRemaining`, duration 140ms, speed 350px/s, cooldown 3500ms, 3 ghost afterimages in lines 1948–1994).
   - **Overhead Entity UI**: Two-tier UI for enemies (lines 135–160): Name Tag at $y - 19$ and Intent Badge at $y - 33$.
   - **Audio Assets**: The `public/assets/` folder contains only PNG textures (`background.png`, `block.png`, `bomb.png`, `enemy.png`, `enemy_tracker.png`, `explosion.png`, `floor.png`, `player.png`, `wall.png`). No external `.mp3` or `.wav` sound files exist, meaning audio feedback must be synthesized via the Web Audio API or procedural sound synthesis.

2. **`src/game/gameplay_mechanics.ts`**:
   - `PlayerStats` interface (lines 7–25) tracks `speed`, `speedLevel`, `maxBombs`, `activeBombs`, `bombPower`, `hasKick`, `hasShield`, `dashCooldownRemaining`, `itemsCollected`, `score`, and `isGameOver`.
   - Lacks any fields for `ultimateGauge`, `ultimateMax`, `isUltimateReady`, `ultimateLockoutRemaining`, or `activeUltimate`.
   - Block destruction drop rate is $45\%$ (`ITEM_DROP_RATE = 0.45`), with soft block destruction and enemy eliminations currently not yielding ultimate energy charge.

3. **`src/components/BombermanGame.tsx`**:
   - **Input Pipeline**: Global `window.mobileInput` contains `{ up, down, left, right, bomb, dash }`. Keydown listeners map `WASD` / Arrow keys to movement, `Space` to bomb, and `Shift` / `E` to dash.
   - **Mobile Action Buttons**: Two virtual action buttons in the bottom-right corner: `[DASH]` (64px, cyan) and `[BOMB]` (80px, ruby red). There is no third button or dedicated slot for an Ultimate Skill trigger.
   - **Arcade Header & HUD Bar**: Real-time stats are bound via `phaserGame.events.on('stats-update', handleStatsUpdate)`. The HUD displays Bombs, Fire Lv, Speed, Dash timer, Kick status, Shield status, and Score, but has no Ultimate Resource Gauge bar.

4. **Authoritative Request (`ORIGINAL_REQUEST.md`)**:
   - Follow-up `2026-09-15T07:08:09Z` specifically stipulates:
     > **R3. Ultimate Skills (필살기)**: Design and implement "Ultimate Skills" for the player and potentially elite enemies/allies. These should be visually spectacular, game-changing abilities with distinct cooldowns or resource requirements.

---

## 2. Logic Chain

### 2.1 Complete Ultimate Skills (필살기) Specification Roster
To deliver game-changing impact, distinct tactical roles, and sensational visual flair, we design **5 Ultimate Skills** spanning Offensive, Area Denial, Utility, Spatiotemporal, and Defensive archetypes:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               ULTIMATE SKILLS ROSTER                                   │
├────────────────────┬──────────────┬───────────────┬─────────────────┬──────────────────┤
│ Skill Name         │ Archetype    │ Targeting     │ Duration/Cast   │ Tactical Fantasy │
├────────────────────┼──────────────┼───────────────┼─────────────────┼──────────────────┤
│ 1. Meteor Strike   │ Heavy Artil. │ Multi-cluster │ 600ms warn+drop │ Annihilation     │
│ 2. Super Nova      │ Radial Shock │ Omni 5-ring   │ 250ms expansion │ Screen Clearing  │
│ 3. Chrono Freeze   │ Spatiotemp.  │ Entire Arena  │ 5.0s stasis     │ God-Mode Flanking│
│ 4. Nuclear Barrage │ Cross Carpet │ 4 Cardinals   │ 1.5s cascade    │ Lane Denial      │
│ 5. Aegis Overdrive │ Defens/Refl. │ Self/Aura     │ 6.0s barrier    │ Counter-Offense  │
└────────────────────┴──────────────┴───────────────┴─────────────────┴──────────────────┘
```

#### Skill 1: Meteor Strike (유성 폭격 / 隕石爆擊)
- **Fantasy**: Summoning a barrage of burning asteroids from the celestial exosphere to incinerate concentrated clusters of enemies and soft blocks.
- **Targeting Algorithm**:
  1. Identifies all enemy coordinates and highest soft-block density clusters on the 13x15 grid.
  2. Selects 8–10 distinct target tiles: 50% guaranteed on live enemy positions, 30% on dense soft block clusters, 20% in forward movement vector of the player.
  3. Rejects indestructible perimeter walls (`TILE_WALL`).
- **Phased Execution**:
  - **Phase 1: Telegraph Reticles (0–600ms)**: Pulsing crimson targeting reticles (`Phaser.GameObjects.Graphics`) spawn on the target tiles. Reticles rotate at $180^\circ/\text{sec}$ with outer circular warning rings shrinking to tile center (`ease: 'Quad.easeIn'`). A high-pitched descending whistle frequency plays.
  - **Phase 2: Atmospheric Descent (600–900ms)**: Fiery meteor heads streak down from $y = -80$ to the target $(x, y)$ at an angle of $75^\circ$. Particle emitter creates a tail of glowing flame particles (`blendMode: Phaser.BlendModes.ADD`, tint `0xff4400` to `0xffdd00`, particle scale 1.2 to 0.1).
  - **Phase 3: Impact & Blast Cratering (900–1200ms)**:
    - On touchdown: Triggers a localized $3 \times 3$ impact explosion centered on the tile.
    - Instantly destroys soft blocks, dealing lethal damage (or 100 HP) to enemies.
    - Causes any existing bombs in the footprint to instantly detonate (chain reaction).
    - Leaves a scorching magma scorch decal on the floor tile for 2000ms that fades away (`alpha: { from: 0.8, to: 0 }`).
- **Elite Enemy / Boss Counterpart**: "Orbital Annihilation" — When an Elite Boss reaches $<50\%$ HP, it channels for 1200ms, raining 6 meteors along the player's anticipated path, forcing dynamic evasion.

#### Skill 2: Giga Blast / Super Nova (초신성 대폭발 / 超新星)
- **Fantasy**: Compressing the player's internal bomb core to critical nuclear mass, then unleashing a blinding omnidirectional shockwave that rips outward in concentric rings.
- **Targeting & Radius**: Centered directly on the caster; expands up to a radius of 5 grid tiles (covering an $11 \times 11$ diamond/circular arena sector, $>70$ tiles).
- **Phased Execution**:
  - **Phase 1: Singularity Implosion (0–300ms)**:
    - The player sprite scales down to 0.7x and is pulled into an intense white-hot tint (`0xffffff`).
    - An inverted particle vortex draws energy particles from radius 160px inward into the player's core.
    - Hit-stop: Engine physics and enemy movements slow to 0.1x for 150ms.
  - **Phase 2: Detonation Flash & Core Shockwave (300–380ms)**:
    - Fullscreen white-hot camera flash: `cameras.main.flash(120, 255, 255, 240)`.
    - Camera Trauma: Instant $+1.0$ (maximum screen shake saturation, 16px displacement).
    - Spawns an expanding luminous shockwave ring that accelerates outward at 500 px/s with triple stroke lines (Golden yellow `0xffdd33`, Orange `0xff6600`, Hot magenta `0xec4899`).
  - **Phase 3: Ring Propagation & Obliteration (380–700ms)**:
    - Ring sweeps across tiles in concentric Manhattan distance bands:
      $$\text{Tile Delay}(r, c) = \text{dist}((\text{playerRow}, \text{playerCol}), (r, c)) \times 40\text{ms}$$
    - As the wavefront hits each tile:
      - Destroys soft blocks (`destroyBlock(r, c)`).
      - Vaporizes standard enemies instantly with golden disintegration sparks.
      - Knocks back elite enemies by 3 tiles and inflicts 150 damage.
      - Disarms or immediately detonates any enemy bombs.
    - Leaves a lingering radiant plasma haze for 1500ms.

#### Skill 3: Chrono Freeze / Time Stop (시간 정지 / 時間停止)
- **Fantasy**: Ripping open the spacetime continuum to freeze all external entity clocks, bomb fuses, and environmental hazards for 5 seconds of absolute free movement.
- **Targeting**: Entire arena (global screen effect).
- **Phased Execution**:
  - **Phase 1: Spacetime Fracture Transition (0–250ms)**:
    - Glass shattering sound effect (synthesized frequency sweep + high-pitch white noise spikes).
    - Visual Color Inversion / Monochromatic Cyan Shader:
      - Camera color matrix applies:
        ```typescript
        this.cameras.main.setColorMatrix();
        // Invert or extreme cyan-desaturate
        this.cameras.main.colorMatrix.desaturate();
        this.cameras.main.colorMatrix.tint(0x38bdf8);
        ```
      - Canvas vignette effect: Deep indigo border overlay vignette (`rgba(15, 23, 42, 0.6)`).
  - **Phase 2: Absolute Stasis State (250–5000ms)**:
    - **Enemies**: All enemy AI update routines bypass physics integration (`body.velocity.set(0, 0)`), sprite animations are paused (`anims.pause()`), and FSM timers are frozen.
    - **Bombs**: All bomb ticking animations, fuse timers (`fuseTimer.paused = true`), and pulsing tweens are frozen mid-pulse.
    - **Gimmicks**: Conveyor belt drift velocity is set to 0; portal teleportation cooldowns pause.
    - **Player Omnipotence**: Player remains completely mobile at $+20\%$ speed boost (`1.2 * playerSpeed`), leaves inverted cyan phantom trails behind, and can place their full quota of bombs with 0 risk of enemy retaliation.
  - **Phase 3: Chrono Resumption (5000–5500ms)**:
    - Clock ticking cadence accelerates: 3 rapid audio pulses at $t = 4200, 4500, 4800\text{ms}$.
    - Color matrix smoothly interpolates back to natural RGB over 300ms (`Quad.easeOut`).
    - Instant resumption: Unpauses all enemy animations, resumes bomb fuses, and plays a massive thunderclap sonic boom as physics recalculates!

#### Skill 4: Nuclear Barrage / Carpet Bombing (카펫 바밍 / 絨毯爆擊)
- **Fantasy**: Firing an automated salvo of tactical cluster warheads in all 4 cardinal corridors simultaneously, saturating pathways with synchronized high-yield explosives.
- **Targeting**: 4 cardinal directions (North, South, East, West) starting from the player's position, penetrating up to 4 tiles deep in each corridor.
- **Mechanic**:
  - Automatically deploys up to 16 tactical mini-nukes (`bombType: 'tactical'`) in a cross (`+`) formation:
    - Skips tiles occupied by indestructible walls (`TILE_WALL`).
    - Soft blocks encountered stop the line progression in that branch.
  - All deployed warheads feature a synchronized **Micro-Fuse Timer (1200ms)**.
  - While ticking, the tactical bombs pulse with intense dark-crimson warning rings (`0xd90429`) and synchronized beep sirens.
  - Detonation occurs in a rolling cascade outwards from the player's center:
    $$t_{\text{detonate}}(k) = 1200\text{ms} + k \times 70\text{ms} \quad (k \in [1 \dots 4] \text{ tiles away})$$
  - Each detonation has $+1$ extra blast radius perpendicular to the lane, turning narrow corridors into complete inferno killzones.

#### Skill 5: Divine Barrier / Aegis Overdrive (이지스 오버드라이브 / 神聖防壁)
- **Fantasy**: Enveloping the player in an impenetrable celestial polyhedral aegis that not only absorbs all fatal damage but reflects lethal retribution onto attacking enemies.
- **Duration**: 6.0 seconds (6000ms).
- **Mechanic**:
  - **Invulnerability**: Sets `isInvulnerable = true` with absolute override over all damage vectors (bomb explosions, enemy contact, environmental spikes).
  - **Visual Aegis Mesh**: Spawns an orbiting procedural hexagonal forcefield graphics object around the player ($r = 28\text{px}$):
    - Revolves at $120^\circ/\text{sec}$ with golden/amber gradient edge stroke (`0xfbbf24` with alpha oscillation between 0.6 and 1.0).
    - 6 orbital light motes circle the perimeter.
  - **Reflective Retribution (반사 대미지)**:
    - If an enemy collides with the player during Aegis Overdrive:
      - The player takes 0 damage.
      - A blinding celestial lightning arc (`0xffffff` core, `0x38bdf8` halo) connects the player to the enemy.
      - The enemy is knocked back 2 tiles in the impact normal and takes lethal damage (destroyed or -100 HP).
      - Audio feedback: High-frequency crystalline resonance chime ($1200\text{Hz}$ sine with stereo chorus).
  - **Explosion Absorption (에너지 흡수)**:
    - Walking into an active bomb explosion does not harm the player; instead, the shield absorbs the thermal energy and grants $+10$ bonus points or extends the barrier duration by $+300\text{ms}$ (capped at 8000ms max).
  - **Mobility Surge**: Player movement speed increases by $+40\text{px/s}$ with golden radiant afterimages.

---

### 2.2 Ultimate Gauge & Resource Architecture

#### 2.2.1 Mathematical Gauge Model & Capacity
- **Capacity**: $G_{\text{max}} = 100$ points.
- **State Variables**:
  ```typescript
  export interface UltimateState {
    gauge: number;                // 0.0 to 100.0 (clamped)
    maxGauge: number;             // 100
    isReady: boolean;             // gauge >= 100 && lockoutRemaining <= 0
    isActive: boolean;            // true while skill execution/channeling is active
    lockoutRemaining: number;     // ms cooldown lockout window (e.g. 6000ms)
    activeSkill: UltimateSkillType; // Selected ultimate
  }
  ```

#### 2.2.2 Charge Sources & Economy Balance
To encourage active, dynamic play while preventing ultimate snowballing, charge rates are calibrated against the typical match pacing (avg match duration 90–150s):

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CHARGE SOURCE TABLE                             │
├──────────────────────────┬──────────────┬──────────────┬───────────────┤
│ Action Event             │ Points Added │ Avg / Match  │ Total Gauge % │
├──────────────────────────┼──────────────┼──────────────┼───────────────┤
│ Soft Block Destroyed     │ +2 pts       │ 20 blocks    │ 40%           │
│ Standard Enemy Defeated  │ +15 pts      │ 2 enemies    │ 30%           │
│ Elite Tracker Defeated   │ +25 pts      │ 1 tracker    │ 25%           │
│ Energy Spark Pickup      │ +10 pts      │ 2 sparks     │ 20%           │
│ Close Call (Near Miss)   │ +5 pts       │ 1-2 times    │ 5-10%         │
│ Passive Survival Drip    │ +1 pt / 3s   │ 60s elapsed  │ 20%           │
└──────────────────────────┴──────────────┴──────────────┴───────────────┘
```

1. **Soft Block Destruction (+2 pts)**:
   - When `destroyBlock(row, col)` executes, add $+2$ to `ultimateGauge`.
   - Floating "+2 ULT" combat text pops up in radiant cyan (`#06b6d4`, font 10px bold, floats up 20px over 350ms).
2. **Enemy Elimination (+15 pts / +25 pts)**:
   - Defeating a standard enemy yields $+15$ pts.
   - Defeating a tracker/elite enemy yields $+25$ pts.
   - Emits a burst of 5 golden energy motes that tween with magnetic attraction towards the player sprite (`Phaser.Math.Distance.Between`, acceleration curve) before adding to the gauge.
3. **Energy Spark Pickup (+10 pts)**:
   - $20\%$ chance when destroying a soft block to drop an **Energy Spark** (번개 모양의 마나 코어).
   - Picking it up grants $+10$ gauge points and $+250$ score.
4. **Close Call / Near-Miss Adrenaline (+5 pts)**:
   - If player hitbox is within 1 tile of an exploding bomb arm $<150\text{ms}$ before detonation and survives, award $+5$ pts with a "CLOSE CALL! +5" alert.
5. **Passive Drip (+1 pt / 3s)**:
   - To prevent defensive stalemates, every 3 seconds of active survival awards $+1$ point.

#### 2.2.3 Lockout & Cooldown Balance Rules
- When the Ultimate is activated:
  1. `ultimateGauge` drops to $0$.
  2. `isUltimateActive` is set to `true` for the duration of the skill.
  3. `ultimateLockoutRemaining` is initialized to **6,000ms (6 seconds)**.
  4. While `ultimateLockoutRemaining > 0`, **gauge generation is completely locked at 0%**.
  5. This prevents a player who clears 15 blocks with Meteor Strike from instantly recharging their gauge back to 100% in a perpetual infinite loop.

#### 2.2.4 Control Trigger System (Cross-Platform)
- **Desktop Keyboard**:
  - Hotkey **`R`**: Primary Ultimate Key (standard in competitive hero/action games).
  - Hotkey **`Q`**: Alternative / secondary binding.
  - Listener mapped cleanly into `keydown` in `BombermanGame.tsx`:
    ```typescript
    if (key === 'r' || key === 'q') {
      window.mobileInput.ultimate = true;
    }
    ```
- **Mobile Responsive Virtual Touch**:
  - In `BombermanGame.tsx`, an ergonomic 3-button arc is established:
    ```
         [ ULTIMATE ] (64px, Gold/Crimson, top-left)
               \
      [ DASH ]  [ BOMB ] (80px, Ruby Red, bottom-right)
      (60px, Cyan)
    ```
  - Touch button features dynamic CSS states:
    - `< 100%`: Grayscale filter, opacity 45%, radial conic-gradient SVG progress ring tracking `0%` to `99%`.
    - `== 100%`: Active radiant amber glow (`box-shadow: 0 0 25px rgba(245, 158, 11, 0.9)`), pulsating scale animation (`scale(1.06)`), haptic vibration burst on touch:
      ```typescript
      if ('vibrate' in navigator) navigator.vibrate([40, 20, 40]);
      ```

---

### 2.3 High-Impact Screen VFX and Sensual Feedback (타격감 & 연출)

#### 2.3.1 Non-Linear Screen Trauma & Shake Model
Linear camera shake ($S = \text{const}$) lacks kinetic weight. We adopt the mathematically superior **Square-Law Trauma Model**:

$$\text{Trauma} \in [0.0, 1.0]$$
$$\text{Trauma}(t) = \max\left(0, \text{Trauma}(t_0) - \lambda \cdot \Delta t\right) \quad \text{where } \lambda = 1.4\text{ s}^{-1} \text{ (decay rate)}$$
$$\text{Offset}_x = \text{Trauma}^2 \times \text{MaxOffset} \times \text{PerlinNoise}(\text{time} \times f)$$
$$\text{Offset}_y = \text{Trauma}^2 \times \text{MaxOffset} \times \text{PerlinNoise}(\text{time} \times f + 100)$$
$$\text{Angle} = \text{Trauma}^2 \times \text{MaxAngle} \times \text{PerlinNoise}(\text{time} \times f + 200)$$

- **Constants**:
  - $\text{MaxOffset} = 18\text{px}$
  - $\text{MaxAngle} = 3.5^\circ$
  - Frequency $f = 25\text{Hz}$
- **Trauma Injection Table**:
  - Standard Bomb: $+0.25$ Trauma
  - Meteor Strike (Per impact): $+0.35$ Trauma
  - Giga Blast / Super Nova: $+1.00$ Trauma (Full Saturation)
  - Chrono Freeze (Resumption Boom): $+0.60$ Trauma
  - Nuclear Barrage (Rolling Cascade): $+0.15$ Trauma per bomb step (cumulative stack to $0.85$)

#### 2.3.2 Expanding Shockwave Graphics Architecture
Instead of single-pixel circles, shockwaves are rendered with multi-layered chromatic dispersion:
```typescript
export function renderMultiShockwave(
  scene: Phaser.Scene,
  centerX: number,
  centerY: number,
  maxRadius: number = 220,
  duration: number = 320,
  palette: number[] = [0xffffff, 0xffaa00, 0xef4444]
) {
  const g = scene.add.graphics();
  g.setDepth(25);

  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: duration,
    ease: 'Cubic.easeOut',
    onUpdate: (tween) => {
      const p = tween.getValue() ?? 0;
      g.clear();

      // Outer ring (expanding fast)
      g.lineStyle(4 * (1 - p) + 0.5, palette[1], 0.9 * (1 - p));
      g.strokeCircle(centerX, centerY, p * maxRadius);

      // Inner refraction ring (lagging 20%)
      const pInner = Math.max(0, p - 0.2) / 0.8;
      g.lineStyle(2 * (1 - pInner) + 0.5, palette[0], 0.7 * (1 - pInner));
      g.strokeCircle(centerX, centerY, pInner * (maxRadius * 0.85));
    },
    onComplete: () => g.destroy(),
  });
}
```

#### 2.3.3 Hit-Stop / Micro-Freeze (카덴스 멈춤)
Hit-stop is the gold standard for tactile impact in fighting games and high-action arcade titles:
- When Giga Blast or Meteor Strike strikes an entity:
  - Phaser scene physics loop is halted for $60\text{ms}$ (3–4 frames):
    ```typescript
    scene.physics.world.pause();
    scene.time.delayedCall(60, () => {
      scene.physics.world.resume();
    });
    ```
  - During the $60\text{ms}$ freeze, the victim entity is tinted pure white (`0xffffff`), vibrating horizontally by $\pm 3\text{px}$.
  - When physics resumes, the entity violently shatters into 8 directional debris particles with an exponential velocity burst ($v = 280\text{px/s}$).

#### 2.3.4 Procedural Web Audio Synthesizer (Zero Asset Dependency)
Because external audio files are not present in the workspace, we design a 100% procedural, high-fidelity Web Audio Synthesizer:

```typescript
export class ProceduralAudioEngine {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // 1. Meteor Strike: Whistle + Low-Pass Explosive Crack
  playMeteorWhistleAndBoom() {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Descending whistle oscillator
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.45);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);

    // Boom noise buffer at touchdown
    setTimeout(() => {
      this.playSubBassBoom(0.6, 50, 450);
    }, 450);
  }

  // 2. Giga Blast: Sub-Bass Boom + White Noise Blast
  playSubBassBoom(duration = 0.8, startFreq = 65, endFreq = 25) {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  // 3. Chrono Freeze: Quantum Resonant Sweep + Time Ticks
  playChronoFreeze() {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, now);
    filter.frequency.exponentialRampToValueAtTime(3200, now + 0.35);
    filter.Q.value = 8;

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  // 4. Aegis Overdrive: Radiant Crystal Arpeggio (C5 - E5 - G5 - C6)
  playAegisChime() {
    const ctx = this.getContext();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const now = ctx.currentTime + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    });
  }
}
```

---

### 2.4 React HUD & Mobile Virtual Controls Integration

#### 2.4.1 Real-Time HUD Gauge Bar Component (`BombermanGame.tsx`)
In `BombermanGame.tsx`, the real-time arcade header is extended with an Ultimate Resource Gauge:

```tsx
{/* Real-Time Ultimate Gauge Bar in Retro Arcade HUD */}
<div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-950/90 border border-amber-500/40 shadow-inner relative overflow-hidden min-w-[180px]">
  {/* Shimmer sweep line when full */}
  {stats.ultimateGauge >= 100 && (
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite] pointer-events-none" />
  )}
  
  <div className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/20 text-amber-300">
    <span className="text-xs">👑</span>
  </div>

  <div className="flex flex-col flex-1">
    <div className="flex justify-between items-center text-[8px] font-mono uppercase tracking-wider">
      <span className={stats.ultimateGauge >= 100 ? 'text-amber-300 font-bold animate-pulse' : 'text-slate-400'}>
        ULTIMATE {stats.ultimateGauge >= 100 ? '(R)' : ''}
      </span>
      <span className="font-bold text-amber-400">
        {Math.floor(stats.ultimateGauge)}%
      </span>
    </div>

    {/* Progress Bar Container */}
    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/80 mt-0.5 relative">
      <div 
        className={`h-full transition-all duration-150 rounded-full ${
          stats.ultimateGauge >= 100 
            ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 shadow-[0_0_10px_rgba(245,158,11,0.8)] animate-pulse' 
            : 'bg-gradient-to-r from-cyan-500 to-blue-600'
        }`}
        style={{ width: `${Math.min(100, Math.max(0, stats.ultimateGauge))}%` }}
      />
    </div>
  </div>

  {/* Active / Lockout Badge */}
  {stats.ultimateLockoutRemaining > 0 ? (
    <span className="text-[9px] font-mono text-rose-400 font-bold">
      {(stats.ultimateLockoutRemaining / 1000).toFixed(1)}s
    </span>
  ) : stats.ultimateGauge >= 100 ? (
    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-black tracking-wider animate-bounce">
      READY
    </span>
  ) : null}
</div>
```

#### 2.4.2 Mobile Virtual Controls 3-Button Layout
```tsx
{/* Action Buttons: DASH, ULTIMATE, BOMB */}
<div className="pointer-events-auto flex items-end gap-2.5 relative">
  {/* Ultimate Button (Offset above Dash/Bomb) */}
  <div className="flex flex-col items-center gap-1 -translate-y-4">
    <button
      type="button"
      onPointerDown={handleUltimatePress}
      disabled={stats.ultimateGauge < 100 || stats.ultimateLockoutRemaining > 0}
      aria-label="Ultimate Skill"
      className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 flex flex-col items-center justify-center transition-all select-none touch-none cursor-pointer ${
        stats.ultimateGauge >= 100 && stats.ultimateLockoutRemaining <= 0
          ? 'bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-600 border-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.8),inset_0_2px_4px_rgba(255,255,255,0.4)] scale-105 animate-pulse'
          : 'bg-slate-800/80 border-slate-700 text-slate-500 opacity-60 grayscale'
      }`}
    >
      <span className="text-lg drop-shadow">👑</span>
      <span className="text-[8px] font-black tracking-wider text-white drop-shadow">
        {stats.ultimateGauge >= 100 ? 'ULT' : `${Math.floor(stats.ultimateGauge)}%`}
      </span>
    </button>
    <span className="text-[8px] font-mono uppercase tracking-widest text-amber-400/80">Ult</span>
  </div>

  {/* Dash Button */}
  <div className="flex flex-col items-center gap-1">
    <button 
      type="button"
      onPointerDown={handleDashPress}
      aria-label="Dash"
      className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-tr from-cyan-600 via-blue-500 to-indigo-600 rounded-full border-2 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.5)] flex flex-col items-center justify-center active:scale-95 transition-all select-none touch-none cursor-pointer"
    >
      <Zap size={20} className="text-white drop-shadow-md" />
      <span className="text-[8px] font-black tracking-wider text-white drop-shadow">DASH</span>
    </button>
    <span className="text-[8px] font-mono uppercase tracking-widest text-cyan-400/80">Dash</span>
  </div>

  {/* Bomb Button */}
  <div className="flex flex-col items-center gap-1">
    <button 
      type="button"
      onPointerDown={handleBombPress}
      aria-label="Plant Bomb"
      className="w-18 h-18 sm:w-20 sm:h-20 bg-gradient-to-tr from-rose-600 via-red-500 to-amber-500 rounded-full border-3 border-rose-400 shadow-[0_0_22px_rgba(239,68,68,0.7)] flex flex-col items-center justify-center active:scale-95 transition-all select-none touch-none cursor-pointer"
    >
      <Bomb size={26} className="text-white drop-shadow-md" />
      <span className="text-[9px] font-black tracking-wider text-white drop-shadow">BOMB</span>
    </button>
    <span className="text-[8px] font-mono uppercase tracking-widest text-rose-400/80">Plant</span>
  </div>
</div>
```

---

## 3. Caveats

1. **Phaser Camera WebGL Shader Support**:
   - Time Stop color matrix desaturation / inversion (`cameras.main.setColorMatrix()`) behaves differently under Canvas vs WebGL rendering modes. If `type: Phaser.AUTO` falls back to Canvas on older mobile devices, color matrix post-processing can incur minor performance penalties. The recommended fallback is an overlay `Graphics` rectangle with blend mode `BlendModes.DIFFERENCE` or dark cyan tint (`rgba(6, 182, 212, 0.35)`).
2. **Chain Reaction Overload**:
   - `Meteor Strike` and `Nuclear Barrage` can detonate many bombs in a rapid succession. In extreme edge cases (e.g. 15 bombs detonating simultaneously), multiple camera shakes can accumulate. The square-law trauma model naturally clamps $\text{Trauma} \le 1.0$, preventing unbounded camera drift.
3. **Multi-Agent Decoupling**:
   - This specification is read-only exploration and design. In accordance with the Project Protocol and Global Agent Rules, source code edits must be scheduled in Milestone 3 under user approval. Downstream workers must keep `PlayerStats` and `mobileInput` backward-compatible with existing test suites.

---

## 4. Conclusion

The designed **Ultimate Skill & High-Impact VFX System** elevates Bomberman from a traditional grid puzzle to an electrifying, sensory-rich arcade experience:

1. **5 Diverse Ultimate Skills**:
   - **Meteor Strike**: Raining devastation for clearing distant entrenched enemy nests.
   - **Super Nova**: Panoramic 5-ring shockwave for clutch escapes when cornered.
   - **Chrono Freeze**: 5-second universal stasis offering high-mastery tactical positioning.
   - **Nuclear Barrage**: 4-way corridor carpet bombing for dominant lane control.
   - **Aegis Overdrive**: 6-second invulnerability with reflective counter-kill mechanics.
2. **100-Point Resource Engine with Anti-Snowball Guard**:
   - Earned via block destruction (+2), enemy kills (+15/+25), energy spark pickups (+10), and survival drip (+1/3s).
   - 6-second lockout window prevents cascading spam loops.
3. **Next-Level Sensual Feedback**:
   - Non-linear Square-Law Trauma Camera Shake ($\le 18\text{px}, \le 3.5^\circ$).
   - Multi-ring chromatic shockwaves with exponential easing.
   - 60ms physics hit-stop on fatal strikes for crushing kinetic weight.
   - 100% procedural Web Audio synthesizer providing thunderous soundscapes without external audio asset downloads.
4. **Seamless Cross-Platform UX**:
   - Desktop keyboard trigger (`'R'`, `'Q'`).
   - Ergonomic mobile 3-button arc with pulsating golden `[ULT]` touch trigger.
   - Shimmering React HUD gauge bar reflecting real-time charge progress.

---

## 5. Verification Method

### 5.1 Static Type & Interface Verification
Inspect and verify the TypeScript type definitions in `src/game/gameplay_mechanics.ts`:
- Ensure `PlayerStats` contains `ultimateGauge: number`, `ultimateMax: number`, `isUltimateReady: boolean`, `ultimateLockoutRemaining: number`, `activeUltimate: UltimateSkillType`.
- Ensure `MobileInputState` in `BombermanGame.tsx` contains `ultimate: boolean`.

### 5.2 Automated Mathematical & State Test Suite (`tests/ultimate_skills.test.mjs`)
Create and execute a Node.js verification test suite covering:
1. **Gauge Clamping**:
   - Feed $+200$ charge to verify `gauge` is strictly capped at $100$.
   - Feed negative delta to verify `gauge` never drops below $0$.
2. **Lockout Enforcement**:
   - Trigger ultimate, verify gauge drops to 0 and `ultimateLockoutRemaining === 6000`.
   - Attempt to add block destruction points during lockout; assert gauge remains at 0.
   - Decrement time by 6001ms; assert lockout clears and gauge can recharge.
3. **Trauma Square-Law Invariant**:
   - Assert $\text{Trauma} \le 1.0$ when multiple simultaneous $+0.35$ trauma injections occur.
   - Verify decay rate $\lambda = 1.4$ brings trauma to $<0.01$ within 800ms.
4. **Time Stop State Isolation**:
   - Verify enemy position updates and bomb fuse timers do not decrement while `isChronoFrozen === true`.

### 5.3 Build & Lint Integrity
Run standard project verification commands:
```bash
npm run lint
npm run build
```
Ensure 0 TypeScript errors and exit code 0.
