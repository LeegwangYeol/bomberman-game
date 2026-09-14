# Dispatch for worker_gdd_2 (Iteration 2 Remediation)

## Objective
Update and harden `/Users/user/src/bomberman/GDD.md` to resolve all 9 mechanics issues from challenger_1, all 4 UI/UX and performance issues from challenger_2, and the technical advisories from reviewer_1 and reviewer_2.

## Source Feedback
- `/Users/user/src/bomberman/.agents/challenger_1/handoff.md`
- `/Users/user/src/bomberman/.agents/challenger_2/handoff.md`
- `/Users/user/src/bomberman/.agents/reviewer_1/handoff.md`
- `/Users/user/src/bomberman/.agents/reviewer_2/handoff.md`

## Required Remediations
### 1. Mechanics Hardening (Challenger 1):
1. **Crisis 1 Singularity Balance**: Prisms project a 3x3 Stabilization Aura when energized, completely halting Void Creep within their sector and reducing overall void expansion by 50% per active prism, ensuring players have sufficient tactical time to complete the objective.
2. **Crisis 2 Dynamo Overload**: Grant temporary "Overdrive Capacitors" (+3 temporary maxBombs) during Phase 3, add magnetic conveyor arrestors within 1 tile of Dynamos, and align EMP pulse windows.
3. **Star Seeker Diagonal Rays**: Clarify ray reflection physics (diagonal rays bounce once off hard pillars at 90-degree angles, creating dynamic ricocheting hazard lines).
4. **BaseBoss Chain Reaction**: Update `takeBombDamage` to buffer simultaneous explosions within a 150ms window before triggering i-frames, allowing multi-bomb chain reactions to deal combo damage and trigger extended stuns (up to 4.5s).
5. **Mid-Boss Event Suspension**: Explicitly state that Dynamic Random Events are paused/suppressed during Mid-Boss encounters (identical to Crisis battles).
6. **Ally Bomb-Phasing & Enemy Touch**: Rescued allies can step over placed bombs (soft-pass) so players cannot accidentally trap them; enemy touch triggers a 2.0s dizzy daze with a bubble shield rather than instant defeat.
7. **Candy Thief Ammo Refund**: Clarify that when Candy Thief consumes a bomb, the player's activeBomb slot is refunded immediately upon consumption.
8. **Remote Detonator Controls**: Specify separate input bindings: Spacebar / Bomb Button = Place Bomb; 'E' / 'X' / Secondary Action Button = Detonate.
9. **Madame Bonbon Stall**: Fixed wall-adjacent spawn rules; shop stall remains open for 45s or until player steps 3 tiles away.

### 2. UI/UX & Canvas Performance Hardening (Challenger 2 & Reviewer 2):
1. **Cross-Platform Emoji & Font Stack**:
   - Update font stack to: `"Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", "Twemoji Mozilla", sans-serif`.
   - Add fallback glyphs for older OS versions (`🫧` -> procedural Canvas bubble circle or `🧼`, `🪄` -> `⭐`).
   - Specify composite layered rendering for multi-character bosses (`👑` drawn at y-offset above `🐻`, etc.).
2. **Canvas 2D Performance & Offscreen Caching**:
   - Explicitly detail offscreen canvas caching for static tiles and pre-rendered bomb glow sprites (`cacheGlowSprite()`).
   - Ban unthrottled real-time `ctx.shadowBlur` at 60 FPS; use radial gradients and cached sprites instead.
   - Particle pooling and batch rendering.
3. **WCAG 2.1 Contrast Compliance**:
   - Use Dark Chocolate (`#4A2E2B`) text strokes (`-webkit-text-stroke: 1.5px #4A2E2B`) and shadows to achieve 7.4:1–11.4:1 contrast ratios over all pastel backgrounds.
   - Add diagonal hatching / pulsing border patterns to strawberry hazard circles for colorblind accessibility.
   - Include the missing `.cute-btn-secondary` CSS styling.
4. **Mobile Touch Ergonomics & Audio**:
   - Update D-pad design: touchmove sliding listener on `.cute-dpad` container, continuous thumb vector evaluation, and compatibility with virtual joysticks (e.g. `nipplejs`).
   - Note `AudioContext.resume()` on first touch/click user gesture.

## Exclusive Write Ownership
You own `/Users/user/src/bomberman/GDD.md` exclusively.
Report completion in `/Users/user/src/bomberman/.agents/worker_gdd_2/handoff.md`.

## 2026-09-14T09:43:45Z
You are the Remediation Author (Worker) for the Cute Web Bomberman project.
Your working directory is: /Users/user/src/bomberman/.agents/worker_gdd_2
Your authoritative request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Your dispatch: /Users/user/src/bomberman/.agents/worker_gdd_2/DISPATCH.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Ownership:
You exclusively own and will edit:
/Users/user/src/bomberman/GDD.md

Source Material:
- Read /Users/user/src/bomberman/.agents/worker_gdd_2/DISPATCH.md for the complete list of 9 mechanics fixes and 4 UI/UX/performance fixes.
- Read /Users/user/src/bomberman/.agents/challenger_1/handoff.md
- Read /Users/user/src/bomberman/.agents/challenger_2/handoff.md
- Read /Users/user/src/bomberman/.agents/reviewer_1/handoff.md
- Read /Users/user/src/bomberman/.agents/reviewer_2/handoff.md

Your Mission:
Surgically and comprehensively update `/Users/user/src/bomberman/GDD.md` to incorporate every single requested change, advisory, and edge-case resolution:
1. Rebalance Crisis 1 Void Creep & Prism Stabilization Auras.
2. Fix Crisis 2 Dynamo Overload with Overdrive Capacitors (+3 bombs in phase 3) and conveyor pauses.
3. Fix Star Seeker diagonal ray reflection physics.
4. Fix BaseBoss damage buffering for multi-bomb combos.
5. Explicitly suspend Random Events during Mid-Boss battles.
6. Give Allies bomb-phasing and daze/bubble rules on enemy touch.
7. Refund Candy Thief bomb slots immediately upon consumption.
8. Clarify Remote Detonator separate trigger controls.
9. Clarify Madame Bonbon stall coordinates and timer.
10. Update Emoji font stacks (`Noto Color Emoji`) and composite layered boss rendering.
11. Detail Canvas offscreen caching, avoid real-time shadowBlur at 60 FPS via pre-rendered glow sprites.
12. Ensure WCAG 2.1 AA contrast compliance with Dark Chocolate (#4A2E2B) text outlines/shadows and textured hazard overlays.
13. Refine Mobile D-pad touchmove sliding logic, add `.cute-btn-secondary` CSS, and note `AudioContext` gesture unlock.

Run `npm run build` after editing to ensure zero build errors.
Write your handoff report to `/Users/user/src/bomberman/.agents/worker_gdd_2/handoff.md`.
When finished, send a message to the orchestrator.
