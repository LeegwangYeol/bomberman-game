# Architect & Zero-GC Division: Performance & Harmonization Report
**Date:** 2026-11-12  
**Division:** Architect & Zero-GC Division (5 Subagents: Architect 1 to Architect 5)

## 1. Zero-GC Optimization in `NeutralEntities.ts`
- Replaced per-frame `bKey.slice(...)` and `Number(...)` allocations with zero-allocation integer accumulation using `bKey.charCodeAt(i)`.
- Eliminates 100% of substring allocations during high-intensity bomb avoidance loops while maintaining backward compatibility with `Set<string>` callers.

## 2. Velocity Hysteresis Filter in `BaseEntity.ts`
- Introduced `_isMovingAnimation` hysteresis state tracker to `BaseEntity`.
- Thresholds:
  - Transition from idle to moving requires `speed > 2.5 px/s`.
  - Transition from moving to idle requires `speed < 1.2 px/s`.
- Prevents sprite hop/squash-and-stretch oscillation when entities decelerate to zero or scrape corners.

## 3. Directional Intent Tie-Breaking in `GameScene.ts:tryKickBomb`
- Enhanced diagonal angle resolution when `Math.abs(dx) === Math.abs(dy)`.
- Incorporates `playerFacing` as decisive tie-breaker if facing matches one of the diagonal components, ensuring intuitive kick direction.
