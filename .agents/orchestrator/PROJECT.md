# Project: Cute Web Bomberman Game Design Document (GDD)

## Architecture
- **Document Path**: `/Users/user/src/bomberman/GDD.md` (2,050 lines, 131 KB)
- **Theme**: Cute, pastel, bubbly, candy/fluffy aesthetic with high tactical Bomberman depth.
- **Visuals**: Pure CSS, HTML5 Canvas 2D procedural rendering, and Unicode Emojis (strictly zero external image assets).

## Feature Inventory
| # | Feature | Description | Milestone | Status |
|---|---------|-------------|-----------|--------|
| 1 | Normal Enemies | 8 distinct cute archetypes with unique movement FSMs, bomb interactions, 7x7 matrix, and scaling | M1, M2, M3, M4 | DONE |
| 2 | Mid-Bosses | 3 multi-phase mid-bosses with 3-tier visual telegraphing, committed trajectories, safe lanes, and BaseBoss class | M1, M2, M3, M4 | DONE |
| 3 | Specialized NPCs & Allies | 4 rescuable allies with safe-rescue protocol & bomb-phasing, 3 companion pets with mood/feeding, Madame Bonbon shop, helper spirits | M1, M2, M3, M4 | DONE |
| 4 | Random Events | 7 dynamic events with triggers, durations, map rules, mid-boss/crisis pause rules | M1, M2, M3, M4 | DONE |
| 5 | Stellaris-Style Crises | 2 deep multi-stage crises (*The Pastel Void Incursion* and *The Clockwork Toy Rebellion*) with Situation Log HUD, buildup warnings, and survival objectives | M1, M2, M3, M4 | DONE |
| 6 | Cute UI Revamp Concept | Pure CSS glassmorphism, WCAG AAA dark chocolate contrast, offscreen Canvas 2D, cached radial glow sprites, particle pooling, composite boss emoji rendering, continuous vector mobile D-pad | M1, M2, M3, M4 | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Swarm Brainstorming | 5 parallel explorer tracks exploring enemies, bosses, NPCs, events/crises, and UI | none | DONE |
| 2 | GDD Drafting | Master GDD authoring synthesizing all 5 tracks into /Users/user/src/bomberman/GDD.md | M1 | DONE |
| 3 | Review & Challenge | Multi-agent review (2 Reviewers, 2 Challengers, Forensic Auditor) & Iteration 2 Remediation | M2 | DONE |
| 4 | Gate Verification & Delivery | Final gate signoff (PASS) and Sentinel completion reporting | M3 | DONE |
