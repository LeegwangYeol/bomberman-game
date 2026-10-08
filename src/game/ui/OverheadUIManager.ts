import { RENDER_DEPTH } from '../entities/types.ts';
import type { OverheadUI } from '../entities/OverheadUI.ts';

export interface DeclutterEntity {
  x: number;
  y: number;
  active: boolean;
  isDead?: boolean;
  setDepth?(depth: number): unknown;
  overheadUI: OverheadUI;
}

export class OverheadUIManager {
  public smoothOuterBubble: boolean = false;
  private readonly _scratchActive: DeclutterEntity[] = [];
  private _offsetsX: Float32Array = new Float32Array(1024);
  private _offsetsY: Float32Array = new Float32Array(1024);

  constructor(smoothOuterBubble: boolean = false) {
    this.smoothOuterBubble = smoothOuterBubble;
  }

  /**
   * Centralized decluttering and dynamic depth coordinator:
   * 1. Dynamic continuous 2.5D Y-sorting depth pass.
   * 2. Adaptive Name Tag LOD (Solo: full, Clustered: compact, Dense melee: minimal/hidden).
   * 3. AABB overlap detection with horizontal spring repulsion (+/- dx/2) and vertical staggering.
   * 4. Player protection bubble (R = 38px, alpha = 0.15 or 0 if <= 20px) with smooth exponential lerp.
   */
  public update(
    entities: DeclutterEntity[],
    player: { x: number; y: number } | null,
    delta: number = 16,
    immediate: boolean = false,
    smoothOuterBubble?: boolean
  ): void {
    this._scratchActive.length = 0;
    for (let k = 0; k < entities.length; k++) {
      const e = entities[k];
      if (e && e.active && !e.isDead && e.overheadUI && !e.overheadUI.isDestroyed) {
        this._scratchActive.push(e);
      }
    }
    const active = this._scratchActive as DeclutterEntity[];

    // 1. Unified 2.5D dynamic Y-sorting depth pass
    for (const entity of active) {
      const baseDepth = RENDER_DEPTH.ENTITY_Y_BASE + entity.y * RENDER_DEPTH.ENTITY_Y_SCALE;
      if (typeof entity.setDepth === 'function') {
        entity.setDepth(baseDepth + RENDER_DEPTH.OFFSET_SPRITE);
      }
      entity.overheadUI.setDepth(baseDepth);
    }

    const playerObj = player as unknown as { setDepth?: (d: number) => unknown } | null | undefined;
    if (player && playerObj && typeof playerObj.setDepth === 'function') {
      const playerBaseDepth = RENDER_DEPTH.ENTITY_Y_BASE + player.y * RENDER_DEPTH.ENTITY_Y_SCALE;
      playerObj.setDepth(playerBaseDepth + RENDER_DEPTH.OFFSET_SPRITE);
    }

    // 2. Adaptive Name Tag LOD calculation
    // Solo mode (d > 70px): full name
    // Clustered mode (d <= 70px): compact nickname
    // Dense melee mode (3+ entities within 60px): minimal (hide text tag, HP & intent only)
    for (let i = 0; i < active.length; i++) {
      const eA = active[i];
      const ax = eA.x;
      const ay = eA.y;
      let minDistSq = Infinity;
      let countWithin60 = 0;

      for (let j = 0; j < active.length; j++) {
        if (i === j) continue;
        const eB = active[j];
        const dx = ax - eB.x;
        const dy = ay - eB.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) {
          minDistSq = distSq;
        }
        if (distSq <= 3600) {
          countWithin60++;
          if (countWithin60 >= 2) {
            break;
          }
        }
      }

      if (player) {
        const dxP = ax - player.x;
        const dyP = ay - player.y;
        const distSqP = dxP * dxP + dyP * dyP;
        if (distSqP < minDistSq) {
          minDistSq = distSqP;
        }
        if (distSqP <= 3600) {
          countWithin60++;
        }
      }

      if (countWithin60 >= 2) {
        eA.overheadUI.setLODMode('minimal');
      } else if (minDistSq <= 4900) {
        eA.overheadUI.setLODMode('compact');
      } else {
        eA.overheadUI.setLODMode('full');
      }
    }

    // 3. AABB Collision Detection, Horizontal Spring Repulsion & Vertical Staggering
    if (this._offsetsX.length < active.length) {
      const newCap = Math.max(active.length, this._offsetsX.length * 2, 1024);
      this._offsetsX = new Float32Array(newCap);
      this._offsetsY = new Float32Array(newCap);
    }
    const safeLen = Math.min(active.length, this._offsetsX.length);
    this._offsetsX.fill(0, 0, safeLen);
    this._offsetsY.fill(0, 0, safeLen);
    const offsetsX = this._offsetsX;
    const offsetsY = this._offsetsY;

    for (let i = 0; i < active.length; i++) {
      const eA = active[i];
      const ax = eA.x;
      const ay = eA.y;
      const lodA = eA.overheadUI.lodMode;
      const widthA = lodA === 'minimal' ? 24 : lodA === 'compact' ? 44 : 88;

      for (let j = i + 1; j < active.length; j++) {
        const eB = active[j];
        const dy = Math.abs(ay - eB.y);
        if (dy >= 16) continue;

        const dx = Math.abs(ax - eB.x);
        if (dx >= 92) continue;

        const lodB = eB.overheadUI.lodMode;
        const widthB = lodB === 'minimal' ? 24 : lodB === 'compact' ? 44 : 88;
        const requiredW = (widthA + widthB) / 2 + 4;

        if (dx < requiredW) {
          // Label overlap detected!
          if (dx >= 24) {
            // Horizontal spring repulsion
            const overlapX = requiredW - dx;
            const shift = overlapX / 2;
            if (eA.x < eB.x) {
              offsetsX[i] -= shift;
              offsetsX[j] += shift;
            } else if (eA.x > eB.x) {
              offsetsX[i] += shift;
              offsetsX[j] -= shift;
            } else {
              offsetsX[i] -= shift;
              offsetsX[j] += shift;
            }
          } else {
            // Tightly stacked horizontally (dx < 24px) -> vertical staggering!
            // Directional accumulation / 3-way staggering prevents overwrite in vertical clusters
            if (eA.y <= eB.y) {
              if (offsetsY[i] === 0) {
                offsetsY[i] = -14;
              } else if (offsetsY[i] < 0) {
                offsetsY[i] -= 14;
              }
              if (offsetsY[j] === 0) {
                offsetsY[j] = 46;
              } else if (offsetsY[j] < offsetsY[i] + 30) {
                offsetsY[j] = Math.max(offsetsY[j] + 30, offsetsY[i] + 46);
              }
            } else {
              if (offsetsY[j] === 0) {
                offsetsY[j] = -14;
              } else if (offsetsY[j] < 0) {
                offsetsY[j] -= 14;
              }
              if (offsetsY[i] === 0) {
                offsetsY[i] = 46;
              } else if (offsetsY[i] < offsetsY[j] + 30) {
                offsetsY[i] = Math.max(offsetsY[j] + 30, offsetsY[j] + 46);
              }
            }
          }
        }
      }
    }

    // Clamp horizontal offsets to arena boundaries
    for (let i = 0; i < active.length; i++) {
      const entity = active[i];
      const intendedX = entity.x + offsetsX[i];
      if (intendedX < 20) {
        offsetsX[i] = 20 - entity.x;
      } else if (intendedX > 600 - 20) {
        offsetsX[i] = (600 - 20) - entity.x;
      }
    }

    // Clamp vertical offsets to stay on-screen ([20, 500])
    for (let i = 0; i < active.length; i++) {
      const entity = active[i];
      const intendedY = entity.y + offsetsY[i];
      if (intendedY < 20) {
        offsetsY[i] = 20 - entity.y;
      } else if (intendedY > 500) {
        offsetsY[i] = 500 - entity.y;
      }
    }

    // 4. Player Protection Bubble (R = 38px)
    const useSmooth = smoothOuterBubble !== undefined ? smoothOuterBubble : this.smoothOuterBubble;
    for (let i = 0; i < active.length; i++) {
      const entity = active[i];
      const ox = offsetsX[i];
      const oy = offsetsY[i];

      let targetAlpha = 1.0;
      if (player) {
        const lx = entity.x + ox;
        const ly = entity.y - 22 + oy;
        const distLabel = Math.hypot(lx - player.x, ly - player.y);
        const distBody = Math.hypot(entity.x - player.x, entity.y - player.y);
        let effectiveDist = Math.min(distLabel, distBody);

        // Status badge protection: if intent indicator is actively displayed, also check status badge position (y - 34)
        if (entity.overheadUI && entity.overheadUI.isIntentVisible) {
          const distIntent = Math.hypot(lx - player.x, entity.y - 34 + oy - player.y);
          if (distIntent < effectiveDist) {
            effectiveDist = distIntent;
          }
        }

        if (effectiveDist <= 20) {
          targetAlpha = 0.0;
        } else if (effectiveDist <= 38) {
          targetAlpha = Math.min(0.15, 0.15 * ((effectiveDist - 20) / (38 - 20)));
        } else if (useSmooth && effectiveDist <= 50) {
          targetAlpha = 0.15 + (1.0 - 0.15) * ((effectiveDist - 38) / (50 - 38));
        }
      }

      let alpha: number;
      if (!immediate && delta > 0) {
        const lerpFactor = Math.min(1.0, delta * 0.015);
        alpha = entity.overheadUI.currentAlpha + (targetAlpha - entity.overheadUI.currentAlpha) * lerpFactor;
      } else {
        alpha = targetAlpha;
      }

      entity.overheadUI.setAlpha(alpha);
      entity.overheadUI.setCustomOffsets(ox, oy);
    }

    // Zero-GC reference cleanup: release strong entity references to prevent heap retention
    for (let k = 0; k < this._scratchActive.length; k++) {
      this._scratchActive[k] = null as unknown as DeclutterEntity;
    }
    this._scratchActive.length = 0;
  }

  public reset(): void {
    for (let k = 0; k < this._scratchActive.length; k++) {
      this._scratchActive[k] = null as unknown as DeclutterEntity;
    }
    this._scratchActive.length = 0;
    this._offsetsX.fill(0);
    this._offsetsY.fill(0);
  }

  public destroy(): void {
    this.reset();
  }
}
