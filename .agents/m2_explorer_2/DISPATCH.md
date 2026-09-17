## 2026-09-17T13:10:13Z

# M2 Explorer 2: 3-Tier Tile Telegraph Engine & Visual System

## Mission
You are M2 Explorer 2 working in `/Users/user/src/bomberman/.agents/m2_explorer_2/`.
You MUST read:
- `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/TEST_INFRA.md`
- `/Users/user/src/bomberman/GDD.md` (Section 2 & 6: Telegraphs & UI)
- `/Users/user/src/bomberman/.agents/explorer_survey_1/report.md`

## Objective
Design:
1. `src/game/bosses/TelegraphEngine.ts`: 3-tier floor tile telegraphing engine:
   - Yellow Stage (2.0s before impact): Subtle warning border (`#FFEB3B` dashed grid outline).
   - Amber Stage (1.0s before impact): Pulsing diagonal hatching (`#F59E0B` diagonal lines with 4Hz pulse).
   - Red Flash Stage (0.5s before impact): Rapid crimson strobe (`#EF4444` solid fill with 8Hz flashing).
2. Fair Encounter Guarantee: Mathematical validation ensuring at least 40% of grid tiles remain safe during all boss telegraphs.
3. Committed Trajectories: Once windup completes, trajectory is locked and telegraph indicators freeze.
4. Canvas 2D Batching: Zero GameObject allocation per telegraph; rendered into a single persistent Graphics layer using flat coordinates.

Write your report to `report.md` and complete handoff in `handoff.md`.
