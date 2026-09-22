# Technical Exploration Report: Bomberman Automated Visual & Functional Testing

**Agent**: Technical Explorer (`explorer_m1`)  
**Milestone**: M1 (Survey & Technical Exploration)  
**Date**: 2026-09-22T05:16:00Z  
**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_m1`  

---

## 1. Observation

### 1.1 Project Structure & Dependencies
- **`package.json`**:
  - `next`: `16.3.5` (Turbopack)
  - `react` / `react-dom`: `19.2.8`
  - `phaser`: `4.2.1`
  - `nipplejs`: `1.0.4`
  - `lucide-react`: `1.45.0`
  - Scripts: `npm run dev` (`next dev`), `npm run build` (`next build`), `npm run start` (`next start`), `npm run lint` (`eslint`), `npm test` (`node --experimental-strip-types --test tests/*.test.mjs tests/unit/*.test.mjs`).
- **Build & Test Baseline**:
  - `npm test`: Exited with code `0` (489 passing tests across 27 suites, 0 failed, duration: ~1.4s).
  - `npm run lint`: Exited with code `0` (0 errors, 39 warnings).
  - `npm run build`: Exited with code `0` (optimized production build generated in ~1.5s).

### 1.2 Frontend & Game Architecture
- **`src/app/page.tsx`**:
  - Uses `next/dynamic` to load `@/components/BombermanGame` with `{ ssr: false }`.
  - Initial hydration placeholder: `<p className="text-xl font-bold animate-pulse">Loading Game...</p>`.
- **`src/components/BombermanGame.tsx`** (1,729 lines):
  - Manages React HUD state, controls, Game Mode selector, Meta-Progression modals (Perk Tree, Relics, Save/Resume, Backup/Sync).
  - Initializes Phaser Game instance with `type: Phaser.AUTO`, `width: 800`, `height: 600`, `scene: [GameScene]`.
  - Bridges events with Phaser via `phaserGame.events`:
    - Listeners: `'stats-update'`, `'currency-reward'`, `'boss-hud-update'`.
    - Emitters: `'mode-changed'`, `'perks-updated'`, `'relics-updated'`, `'resume-run-state'`.
- **`src/game/GameScene.ts`** (3,939 lines):
  - Primary Phaser scene rendering tilemap (13 rows x 15 cols, 40px tiles), player animations (12-frame spritesheet `public/assets/player.png`), enemies (`Chaser`, `Bomber`, `Tank`, `Ghost`, `Splitter`), AI pathfinding (`findPathBFS`), bombs, items (24 types), skills (dash, kick, shield), ultimate skills.
  - Event listener `this.game.events.on('mode-changed', this.onModeChanged)` at line 1613.

### 1.3 Triggering the 4 Key Stages

#### Stage 1: Main Menu
- **Observation**:
  - On page load (`http://localhost:3000`), the top UI section acts as the Arcade Cabinet Control Center / Mode Selector (`BombermanGame.tsx` lines 633–799).
  - Contains:
    1. Marquee Header: `"BOMBERMAN ARCADE"`, `"CLASSIC 1983"`, controls guide badges (`WASD`, `Space`, `Shift/E`, `R/Q`).
    2. Mode Selector Tabs: `[💣 Standard Adventure] [🌌 Crisis Survival] [👑 Boss Rush Gauntlet] [🌀 Endless Gauntlet]`.
    3. Meta-Progression status bar: Star Candies (🍬), Cosmic Sugar Essence (✨), `Perks (16)` button, `Relics (1/1)` button, `Save` button, `Backup/Sync` button.
    4. Clicking `Perks (16)` opens the full-screen `Confectionery Perk Tree Modal` (`isPerkModalOpen`, lines 1361–1450).

#### Stage 2: Standard Gameplay
- **Observation**:
  - Default mode on page load is `GameModeType.STANDARD`.
  - `GameScene` immediately initializes with:
    - 800x600 canvas rendering grid, destructible blocks, conveyor belts, and portals.
    - Player sprite at `(startX, startY)` with 4-directional walk animations.
    - Patrolling/tracking enemies with overhead nametags and intent badges.
    - Real-time Retro Arcade HUD bar: `BOMBS (0/1)`, `FIRE (Lv. 1)`, `SPEED (130 px/s)`, `ULT (0%)`, `DASH (READY)`, `KICK`, `SHIELD`, `SCORE (000000)`, and Arsenal tray (`collectedItems`).

#### Stage 3: Epic Boss Fight
- **Observation**:
  - In `src/components/BombermanGame.tsx` line 700:
    ```typescript
    onClick={() => handleModeSelect(mode.id)}
    ```
    Emits `'mode-changed'` with `mode.id`.
  - In `src/game/GameScene.ts` lines 1003–1009:
    ```typescript
    private onModeChanged = (mode: string) => {
      if (mode === 'boss_rush' || mode === 'BOSS_RUSH') {
        this.startBossEncounter('king_gummy_bear');
      } else if (this.activeBoss) {
        this.dismissBoss();
      }
    };
    ```
  - In `src/game/GameScene.ts` lines 1619–1636:
    ```typescript
    public startBossEncounter(bossId: string): void {
      this.dismissBoss();
      const startX = 300;
      const startY = 260;
      if (bossId === 'captain_nibbles' || bossId === 'boss_hamster_nibbles') {
        this.activeBoss = new HamsterBoss(startX, startY);
      } else if (bossId === 'queen_bee_cupcake' || bossId === 'boss_queen_bee') {
        this.activeBoss = new QueenBeeBoss(startX, startY);
      } else {
        this.activeBoss = new GummyBearBoss(startX, startY);
      }
      if (this.bossHUD) {
        this.bossHUD.initBoss(this.activeBoss.config.id as BossId, this.activeBoss.maxHp);
      }
    }
    ```
  - In `src/components/BombermanGame.tsx` lines 1073–1130:
    Renders dynamic Boss HUD overlay (`bossHudState.isActive`):
    - Avatar emoji (`👑🐻`), Name (`King Gummy Bear`), Title (`Colossus of Gelatin`), Phase segmented HP bars, Berserk Rage gauge (`0% - 100%`).
  - **Live Verification**:
    - Evaluated script clicking `Boss Rush Gauntlet` button via Chrome DevTools MCP.
    - Result: `bossHudState` mounted immediately (`{"hasBossOverlay":true,"textContent":"👑🐻\nKing Gummy Bear\nColossus of Gelatin\nBERSERK RAGE\n3%"}`).
    - Successfully captured live screenshot `test_boss_fight.png` (1.3 MB).

#### Stage 4: Map Crisis Event
- **Observation**:
  - The codebase has a dedicated, production-ready Stellaris crisis subsystem in `src/game/crises/`:
    - `CrisisManager.ts`: 3-stage FSM (`WHISPERS`, `OUTBREAK`, `CLIMAX`), threat meter, hazard management.
    - `BaseCrisis.ts`, `VoidCrisis.ts`, `ClockworkCrisis.ts`, `OrbitalCrisis.ts`, `SolarFlareCrisis.ts`, `LavaCrisis.ts`, `RiftCrisis.ts`.
    - `SituationLog.ts`: HUD controller and event bridge emitting `'situation-log-update'`.
    - Tested extensively in `tests/crises.test.mjs` (812 lines, all passing).
  - **Crucial Architectural Disconnect**:
    - In `src/game/GameScene.ts`, line 1003:
      `onModeChanged` only checks for `'boss_rush'`. It does NOT instantiate `CrisisManager` or call `triggerCrisis()` when `mode === 'CRISIS_SURVIVAL'`.
    - In `src/components/BombermanGame.tsx`:
      Clicking `Crisis Survival` updates `selectedMode` and renders the description `"Stellaris 🌌: Survive against escalating Stellaris-style cosmic disasters striking every 60 seconds."`, but no crisis hazard graphics or Situation Log HUD overlay appear on screen.

### 1.4 Browser Automation & Screenshot Capabilities
- **Chrome Binaries & Environment**:
  - Host OS: macOS.
  - Node version: `v25.8.1`.
  - Installed Chrome: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- **Tool 1: `chrome-devtools-mcp` (Primary)**:
  - Active and connected to Chrome instance.
  - Verified MCP tools:
    - `new_page({ url: "http://localhost:3000" })`: Successfully created page ID 5.
    - `list_console_messages({ pageId: 5 })`: Successfully retrieved console logs (`Phaser v4.2.1 (WebGL | Web Audio)`).
    - `evaluate_script({ pageId: 5, function: ... })`: Successfully queried DOM, clicked buttons, verified HUD state.
    - `take_screenshot({ pageId: 5 })`: Successfully captured high-resolution viewport.
  - **Pitfall Observed with `take_screenshot`**:
    - Calling with `filePath: "/Users/user/src/bomberman/.../screenshot.png"` triggered:
      `Error: Access denied: path ... is not within any of the configured workspace roots.`
    - Workaround Verified: Calling `take_screenshot` without `filePath` offloads the image to `.system_generated/steps/<stepId>/media_0.png`. Running `cp <offloaded_path> <dest>` copies the high-res PNG cleanly with zero errors.
- **Tool 2: Chrome Headless CLI (Secondary / Standalone)**:
  - Command:
    `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --screenshot=/Users/user/src/bomberman/.agents/explorer_m1/test_chrome_cli.png --window-size=1280,900 http://localhost:3000`
  - Result: Generated 137 KB screenshot file cleanly in background task.

---

## 2. Logic Chain

1. **Premise 1**: The task requires capturing 4 distinct screenshots (Menu, Gameplay, Boss Fight, Crisis Event) using a real browser environment, monitoring console errors, and fixing any discovered bugs.
2. **Premise 2**: Next.js dev server (`npm run dev -- -p 3000`) is running and returns HTTP 200 OK. Chrome DevTools MCP is already running, connected, and has demonstrated zero-latency page inspection and script execution.
3. **Premise 3**: For Stages 1 to 3:
   - Stage 1 (Menu): The initial screen displays the Arcade Header, 4 Mode Selector buttons, and Meta-Progression status.
   - Stage 2 (Gameplay): Standard Adventure mode runs active gameplay on canvas with retro HUD.
   - Stage 3 (Boss Fight): Clicking the `Boss Rush Gauntlet` button cleanly switches mode, spawns King Gummy Bear on the canvas, and mounts the React Boss HUD overlay.
4. **Premise 4**: For Stage 4 (Map Crisis Event):
   - Currently, switching to `Crisis Survival` only updates the mode text in the UI header. The `CrisisManager` and `SituationLog` subsystems (which exist in `src/game/crises/`) are not invoked by `GameScene.ts`.
   - Without integrating `CrisisManager` in `GameScene.ts` and adding a Situation Log HUD in `BombermanGame.tsx`, a screenshot of Crisis Survival would look visually indistinguishable from standard gameplay.
5. **Deduction**: Therefore, for Milestone 2 / 3, the Worker should:
   - Wire `CrisisManager` into `GameScene.ts` upon `onModeChanged('CRISIS_SURVIVAL')` to spawn crisis hazards (such as `VoidCrisis` with void rifts and purification prisms).
   - Render hazard graphics via Phaser Graphics and bridge `SituationLog` updates to `BombermanGame.tsx` to display a Situation Log HUD overlay.
   - Use `chrome-devtools-mcp` to navigate the 4 stages, capture screenshots (using offloaded file copy), monitor console messages (confirming 0 errors), and save images to `/Users/user/src/bomberman/screenshots/`.

---

## 3. Caveats

1. **Dev Server Persistence**:
   - The Next.js dev server is running as background task `task-110`. If the terminal environment resets or the process stops, the Worker must ensure `npm run dev -- -p 3000` or `npm start -- -p 3000` is active before navigating in Chrome.
2. **Phaser Canvas Loading Delay**:
   - Next.js dynamic import loads `BombermanGame` client-side only. There is a ~500ms initial loading delay before Phaser creates the `<canvas>` element and initializes assets. Automated scripts must poll or wait for `document.querySelector('canvas')` before taking screenshots or interacting.
3. **Audio Context Suspended Warning**:
   - Chrome requires user gesture before Web Audio context can emit sound. `AudioVoicePool.ts` has a built-in safe fallback that does not throw errors when suspended.
4. **Screenshot Workspace Restriction**:
   - As noted, `take_screenshot` MCP tool rejects absolute file paths outside its configured root. Always use `take_screenshot` without `filePath` and copy the resulting offloaded image.

---

## 4. Conclusion & Concrete Recommendations for Worker

### 4.1 Required 4 Stages & Trigger Recipes

| Stage | Target Filename | UI / Trigger Action | Expected Visual Elements |
|---|---|---|---|
| **1. Main Menu** | `screenshots/menu.png` | Navigate to `http://localhost:3000/` (Default view, or open `Perks (16)` modal) | Arcade Marquee header ("BOMBERMAN ARCADE CLASSIC 1983"), Mode selector buttons, Meta-progression currency badges, Controls guide pills. |
| **2. Standard Gameplay** | `screenshots/gameplay.png` | Ensure `Standard Adventure` mode is active, wait 1s for player & enemies to render | Phaser canvas showing player sprite, destructible blocks, portals, enemies with nametags; Retro Arcade HUD with Bombs (0/1), Fire, Speed, Ult gauge, Arsenal shelf. |
| **3. Epic Boss Fight** | `screenshots/boss_fight.png` | Click `Boss Rush Gauntlet` button (`👑 Boss Rush Gauntlet`) | Top Boss HUD overlay ("👑🐻 King Gummy Bear", segmented phase HP bars, Berserk Rage gauge), Boss circle graphics & attack telegraph rings on canvas. |
| **4. Map Crisis Event** | `screenshots/crisis_event.png` | Click `Crisis Survival` button (`🌌 Crisis Survival`) + Crisis integration patch | Situation Log HUD overlay (Crisis name e.g. "Pastel Void Incursion", threat meter, active objectives) + environmental hazard tiles (void rifts, prisms, lava, etc.) on canvas. |

### 4.2 Recommended Remediation for Map Crisis Event (Worker Scope)
To satisfy Acceptance Criterion R1 with high visual polish:
1. In `src/game/GameScene.ts`:
   - Import `CrisisManager`, `CrisisType`, `SituationLog` from `./crises/index.ts`.
   - Add `public crisisManager: CrisisManager = new CrisisManager();`
   - Add `public situationLog: SituationLog = new SituationLog(this.game);`
   - Add `public crisisGraphics: Phaser.GameObjects.Graphics | null = null;`
   - In `onModeChanged`:
     ```typescript
     if (mode === 'crisis_survival' || mode === 'CRISIS_SURVIVAL') {
       this.crisisManager.triggerCrisis(CrisisType.PASTEL_VOID);
       this.situationLog.updateFromCrisisManager(this.crisisManager, Date.now(), true);
     } else {
       this.crisisManager.stopCrisis('reset');
       this.situationLog.reset();
       if (this.crisisGraphics) this.crisisGraphics.clear();
     }
     ```
   - In `update()`:
     If crisis is active, call `this.crisisManager.update(delta)` and render active hazard tiles on `this.crisisGraphics`.
2. In `src/components/BombermanGame.tsx`:
   - Listen to `'situation-log-update'` from `phaserGame.events`.
   - Render a stylish Situation Log HUD card when `situationLog.isActive` (Crisis icon, title, threat meter bar, objectives).

### 4.3 Automated Screenshot Procedure for Worker
Using `chrome-devtools-mcp`:
1. `new_page({ url: "http://localhost:3000" })` -> returns `pageId`.
2. Wait 1500ms for Phaser canvas:
   `evaluate_script({ pageId, function: "() => new Promise(r => setTimeout(r, 1500))" })`.
3. Capture Stage 1 (Menu):
   `take_screenshot({ pageId })` -> copy offloaded file to `screenshots/menu.png`.
4. Capture Stage 2 (Gameplay):
   Move player slightly or wait 1000ms:
   `take_screenshot({ pageId })` -> copy offloaded file to `screenshots/gameplay.png`.
5. Capture Stage 3 (Boss Fight):
   `evaluate_script` to click `Boss Rush Gauntlet` button, wait 1000ms:
   `take_screenshot({ pageId })` -> copy offloaded file to `screenshots/boss_fight.png`.
6. Capture Stage 4 (Crisis Event):
   `evaluate_script` to click `Crisis Survival` button, wait 1000ms:
   `take_screenshot({ pageId })` -> copy offloaded file to `screenshots/crisis_event.png`.
7. Check console errors:
   `list_console_messages({ pageId, types: ["error"] })` -> verify 0 errors.

---

## 5. Verification Method

To independently verify all findings:
1. **Verify test suite**:
   ```bash
   npm test
   ```
   Must pass all 489 tests.
2. **Verify production build**:
   ```bash
   npm run build
   ```
   Must exit with code 0.
3. **Verify linting**:
   ```bash
   npm run lint
   ```
   Must show 0 errors.
4. **Verify dev server response**:
   ```bash
   curl -s -I http://localhost:3000
   ```
   Must return `HTTP/1.1 200 OK`.
5. **Verify live boss fight screenshot captured during exploration**:
   ```bash
   ls -lh /Users/user/src/bomberman/.agents/explorer_m1/test_boss_fight.png
   ```
   File exists and is >1 MB PNG.
6. **Invalidation Conditions**:
   - If port 3000 is blocked or dev server fails to compile.
   - If `chrome-devtools-mcp` is disconnected or Chrome binary is moved.
