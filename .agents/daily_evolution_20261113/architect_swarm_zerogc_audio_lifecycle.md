# Architect & Zero-GC Harmonization Report
**Date:** 2026-11-13  
**Division:** Architect & Zero-GC Division (5 Subagents)

## Implemented Optimizations
1. **Zero-GC Key Parser (`pathfinding.ts`):**
   - Implemented `parseGridKeyFast()` using fast `charCodeAt` scanning for row and column integers from `"r,c"` keys.
   - Eliminated `key.slice()` and `.trim()` allocations in `FlatHazardMask.has()`, `add()`, and `delete()`.
2. **NeutralEntities Zero-GC Enumeration (`NeutralEntities.ts`):**
   - Eliminated per-frame arrow function closure in `MerchantNPC.updateAI()` for hazard mask checks.
   - Replaced array filtering with singleton indexed iteration for `CritterNPC.updateAI()`.
3. **Spatial Separation Entity Reference Retention (`SpatialSeparation.ts`):**
   - Added `this.scratchActive.length = 0;` at both exit points of `resolveSeparation()` to eliminate inter-frame entity memory retention.
   - Guarded iterative grid passes from mid-loop truncation.
4. **WebAudio Lifecycle & Deallocation:**
   - Released procedural white noise buffer in `GravityHazardAudio.ts` `destroy()`.
   - Removed unmanaged `closeable.close()` call in `MiasmaHazardAudio.ts`.
