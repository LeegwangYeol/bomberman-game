# Scout Swarm Architecture Target Map
**Date:** 2026-11-13  
**Division:** Scout & Context Division (5 Subagents)

## Findings & Actionable Targets
1. **Unpartnered Relic & Synergy Topology:**
   - With the addition of `TESLA_OVERCHARGE_COIL` on 2026-11-12, the relic synergy graph had an unpartnered node.
   - Identified the 14th Relic opportunity: `CORROSIVE_MIASMIC_FLASK` (Miasma elemental) partnering with `TESLA_OVERCHARGE_COIL` to create the 10th Synergy `Bio-Electric Neuro-Overload`.
   - Expands total pairwise combinations from 78 to 91 ($14 \times 13 / 2 = 91$).
2. **High-Frequency String Churn in `FlatHazardMask` (`pathfinding.ts`):**
   - Discovered repeated string slice and trim operations in `FlatHazardMask.has()`, `add()`, and `delete()`.
   - Recommended zero-allocation integer charCode parsing (`parseGridKeyFast`).
3. **Psychic Crisis Manifestation Remote Exploit:**
   - In `src/game/crises/PsychicCrisis.ts`, distant manifestations were destroyed on any bomb detonation due to an uncontained fallback loop.
   - Target: Require physical blast radius overlap for manifestation destruction.
