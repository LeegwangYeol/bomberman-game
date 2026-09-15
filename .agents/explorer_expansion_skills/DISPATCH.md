## 2026-09-15T07:11:47Z
You are an Explorer specializing in Ultimate Skills (필살기), Resource/Gauge Systems, Screen VFX, and Audio-Visual Impact for Bomberman.
Working directory: /Users/user/src/bomberman/.agents/explorer_expansion_skills/
Authoritative request path: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md (specifically '## Follow-up — 2026-09-15T07:08:09Z'). Read it before doing anything!
Also read /Users/user/src/bomberman/COLLABORATION.md and /Users/user/src/bomberman/PROJECT.md.
Read existing codebase files: `src/game/GameScene.ts`, `src/game/gameplay_mechanics.ts`, `src/components/BombermanGame.tsx`.

Your Mission:
1. Brainstorm and specify 3 to 5 visually spectacular Ultimate Skills (필살기) for the player (and elite entities):
   - Meteor Strike (targets grid areas with raining firebombs, obliterating blocks and enemies)
   - Giga Blast / Super Nova (massive radial shockwave clearing multiple concentric rings)
   - Time Stop / Chrono Freeze (freezes all enemies, bombs, and hazard timers for 5 seconds with inverted palette / visual shader effect)
   - Nuclear Barrage / Carpet Bombing (simultaneous multi-tile bomb deployment in cardinal directions)
   - Divine Barrier / Aegis Overdrive (invulnerability + reflective damage aura)
2. Design the Ultimate Gauge / Charging Mechanism:
   - Gauge capacity (e.g. 100 points)
   - Charge sources: breaking soft blocks (+2), defeating enemies (+15), collecting energy sparks (+10)
   - Triggers: Keyboard hotkey ('R' or 'Space' or 'Q') and responsive mobile touch button [ULTIMATE]
   - Cooldown / lockout window to maintain competitive game balance
3. Design High-Impact VFX and Sensual Feedback:
   - Screen shake intensities and trauma decay
   - Shockwave rings, flash overlays, expanding particle bursts using Phaser particle emitters / graphics
   - Slow-motion hit-stop / chromatic aberration feel
4. React HUD integration:
   - Glowing ultimate gauge bar with pulse animation when 100% full
   - Skill selection or active skill indicator
5. Write a comprehensive report to `/Users/user/src/bomberman/.agents/explorer_expansion_skills/handoff.md`.
Communicate your completion back via send_message.
