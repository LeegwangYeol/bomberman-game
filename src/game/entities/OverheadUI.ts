import type Phaser from 'phaser';
import type { EntityFaction, OverheadRenderLayers, NameTagLODMode } from './types.ts';
import { RENDER_DEPTH } from './types.ts';

interface ISceneOverheadPools {
  graphicsPool?: {
    acquire: () => Phaser.GameObjects.Graphics;
    release: (graphics: Phaser.GameObjects.Graphics) => void;
  };
  nameTagTextPool?: {
    acquire: () => Phaser.GameObjects.Text;
    release: (text: Phaser.GameObjects.Text) => void;
  };
  intentBadgeTextPool?: {
    acquire: () => Phaser.GameObjects.Text;
    release: (text: Phaser.GameObjects.Text) => void;
  };
}

/**
 * 3-Tier Overhead UI Component for Bomberman Entities.
 * Tier 1 (y - 14): Segmented HP Bar (24x4px, segmented by maxHp)
 * Tier 2 (y - 22): Faction Name Tag (9px bold monospace with dark slate background)
 * Tier 3 (y - 34): Intent Badge / Emoji Indicator (13px bold centered)
 */
export class OverheadUI {
  public scene: Phaser.Scene | null;
  public name: string;
  public fullName: string;
  public compactName: string;
  public faction: EntityFaction;
  public maxHp: number;
  public currentHp: number;
  public barWidth: number;
  public barHeight: number;
  public hpBarColor?: number;

  public x: number = 0;
  public y: number = 0;
  public customOffsetX: number = 0;
  public customOffsetY: number = 0;
  public currentAlpha: number = 1.0;
  public targetAlpha: number = 1.0;
  public lodMode: NameTagLODMode = 'full';
  public intentGlyph: string = '';
  public isIntentVisible: boolean = false;
  public isDestroyed: boolean = false;

  // Offsets matching specification harness
  public readonly tier1_hp_y_offset = -14;
  public readonly tier2_name_y_offset = -22;
  public readonly tier3_intent_y_offset = -34;

  public hpGraphics: Phaser.GameObjects.Graphics | null = null;
  public nameTag: Phaser.GameObjects.Text | null = null;
  public indicator: Phaser.GameObjects.Text | null = null;
  private hpGraphicsFromPool: boolean = false;
  private nameTagFromPool: boolean = false;
  private indicatorFromPool: boolean = false;
  private hpGraphicsPoolRef: ISceneOverheadPools['graphicsPool'] | null = null;
  private nameTagPoolRef: ISceneOverheadPools['nameTagTextPool'] | null = null;
  private indicatorPoolRef: ISceneOverheadPools['intentBadgeTextPool'] | null = null;

  private lastRenderedHp: number = -1;
  private lastRenderedMaxHp: number = -1;
  private lastRenderedBarX: number = -999999;
  private lastRenderedBarY: number = -999999;
  private lastRenderedWidth: number = -1;
  private lastRenderedFaction?: EntityFaction;
  private lastRenderedColor?: number;
  private lastRenderedVisible: boolean = true;

  private readonly _cachedRenderLayersBase: OverheadRenderLayers = {
    tier1_hp: { x: 0, y: 0, width: 24, height: 4, ratio: 1, segments: 1 },
    tier2_name: { x: 0, y: 0, text: '', color: '#fb923c' },
    tier3_intent: { x: 0, y: 0, glyph: '', visible: false },
  };
  private readonly _cachedRenderLayersOffset: OverheadRenderLayers = {
    tier1_hp: { x: 0, y: 0, width: 24, height: 4, ratio: 1, segments: 1 },
    tier2_name: { x: 0, y: 0, text: '', color: '#fb923c' },
    tier3_intent: { x: 0, y: 0, glyph: '', visible: false },
  };

  constructor(
    scene: Phaser.Scene | null,
    name: string,
    faction: EntityFaction,
    maxHp: number,
    barWidth: number = 24,
    hpBarColor?: number
  ) {
    this.scene = scene;
    this.name = name;
    this.fullName = name;
    this.compactName = name.includes(':') ? name.split(':')[1].trim() : name;
    this.faction = faction;
    this.maxHp = Math.max(1, maxHp);
    this.currentHp = this.maxHp;
    this.barWidth = barWidth;
    this.barHeight = 4;
    this.hpBarColor = hpBarColor;

    this.acquireRenderObjects();
  }

  private getFactionNameColor(): string {
    return this.faction === 'enemy' ? '#fb923c' : this.faction === 'ally' ? '#22d3ee' : '#fbbf24';
  }

  private resetRenderCache(): void {
    this.lastRenderedHp = -1;
    this.lastRenderedMaxHp = -1;
    this.lastRenderedBarX = -999999;
    this.lastRenderedBarY = -999999;
    this.lastRenderedWidth = -1;
    this.lastRenderedFaction = undefined;
    this.lastRenderedColor = undefined;
    this.lastRenderedVisible = true;
  }

  private acquireRenderObjects(): void {
    const scene = this.scene;
    if (!scene || !scene.add) return;

    const sceneWithPool = scene as unknown as ISceneOverheadPools;

    // Tier 1: HP Bar Graphics
    if (!this.hpGraphics && typeof scene.add.graphics === 'function') {
      if (sceneWithPool.graphicsPool) {
        const pooledG = sceneWithPool.graphicsPool.acquire();
        if (pooledG) {
          this.hpGraphics = pooledG;
          this.hpGraphicsFromPool = true;
          this.hpGraphicsPoolRef = sceneWithPool.graphicsPool;
        }
      }
      if (!this.hpGraphics) {
        this.hpGraphics = scene.add.graphics();
        this.hpGraphicsFromPool = false;
        this.hpGraphicsPoolRef = null;
      }
    }
    if (this.hpGraphics) {
      if (typeof this.hpGraphics.setActive === 'function') this.hpGraphics.setActive(true);
      if (typeof this.hpGraphics.setVisible === 'function') this.hpGraphics.setVisible(true);
      if (typeof this.hpGraphics.setAlpha === 'function') {
        this.hpGraphics.setAlpha(this.currentAlpha);
      }
      this.hpGraphics.setDepth(RENDER_DEPTH.ENTITY_Y_BASE + RENDER_DEPTH.OFFSET_HP_BAR);
    }

    // Tier 2: Name Tag Text (Zero-GC pooled when scene.nameTagTextPool has capacity)
    const nameColor = this.getFactionNameColor();

    if (!this.nameTag && sceneWithPool.nameTagTextPool) {
      const pooledName = sceneWithPool.nameTagTextPool.acquire();
      if (pooledName) {
        this.nameTag = pooledName;
        this.nameTagFromPool = true;
        this.nameTagPoolRef = sceneWithPool.nameTagTextPool;
      }
    }
    if (!this.nameTag && typeof scene.add.text === 'function') {
      this.nameTag = scene.add
        .text(0, 0, this.fullName, {
          fontSize: '9px',
          fontStyle: 'bold',
          fontFamily: 'monospace, "Press Start 2P", Arial, sans-serif',
          color: nameColor,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          padding: { x: 3, y: 1 },
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(RENDER_DEPTH.ENTITY_Y_BASE + RENDER_DEPTH.OFFSET_NAME_TAG);
      this.nameTagFromPool = false;
      this.nameTagPoolRef = null;
    }
    if (this.nameTag) {
      if (typeof this.nameTag.setActive === 'function') this.nameTag.setActive(true);
      if (typeof this.nameTag.setVisible === 'function') this.nameTag.setVisible(true);
      if (typeof this.nameTag.setAlpha === 'function') this.nameTag.setAlpha(this.currentAlpha);
      if (typeof this.nameTag.setScale === 'function') this.nameTag.setScale(1, 1);
      if (typeof this.nameTag.setOrigin === 'function') this.nameTag.setOrigin(0.5, 0.5);
      if (typeof this.nameTag.setColor === 'function') this.nameTag.setColor(nameColor);
      if (typeof this.nameTag.setText === 'function') this.nameTag.setText(this.fullName);
      if (typeof this.nameTag.setDepth === 'function') {
        this.nameTag.setDepth(RENDER_DEPTH.ENTITY_Y_BASE + RENDER_DEPTH.OFFSET_NAME_TAG);
      }
    }

    // Tier 3: Intent Indicator Badge (Zero-GC pooled when scene.intentBadgeTextPool has capacity)
    if (!this.indicator && sceneWithPool.intentBadgeTextPool) {
      const pooledBadge = sceneWithPool.intentBadgeTextPool.acquire();
      if (pooledBadge) {
        this.indicator = pooledBadge;
        this.indicatorFromPool = true;
        this.indicatorPoolRef = sceneWithPool.intentBadgeTextPool;
      }
    }
    if (!this.indicator && typeof scene.add.text === 'function') {
      this.indicator = scene.add
        .text(0, 0, '', {
          fontSize: '13px',
          fontStyle: 'bold',
          fontFamily: 'monospace, Arial, sans-serif',
          color: '#FFD700',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(RENDER_DEPTH.ENTITY_Y_BASE + RENDER_DEPTH.OFFSET_INTENT_BADGE)
        .setVisible(false);
      this.indicatorFromPool = false;
      this.indicatorPoolRef = null;
    }
    if (this.indicator) {
      if (typeof this.indicator.setActive === 'function') this.indicator.setActive(true);
      if (typeof this.indicator.setVisible === 'function') this.indicator.setVisible(false);
      if (typeof this.indicator.setAlpha === 'function') {
        this.indicator.setAlpha(this.currentAlpha);
      }
      if (typeof this.indicator.setScale === 'function') this.indicator.setScale(1, 1);
      if (typeof this.indicator.setOrigin === 'function') this.indicator.setOrigin(0.5, 0.5);
      if (typeof this.indicator.setColor === 'function') this.indicator.setColor('#FFD700');
      if (typeof this.indicator.setText === 'function') this.indicator.setText('');
      if (typeof this.indicator.setDepth === 'function') {
        this.indicator.setDepth(RENDER_DEPTH.ENTITY_Y_BASE + RENDER_DEPTH.OFFSET_INTENT_BADGE);
      }
    }
  }

  /**
   * Zero-GC revival for pooled entities: resets all transient offsets, alpha, LOD,
   * intent badge, and render cache in-place, re-acquiring pooled display objects if destroyed.
   */
  public revive(maxHp?: number, faction?: EntityFaction): void {
    if (maxHp !== undefined && maxHp > 0) this.maxHp = maxHp;
    if (faction !== undefined) this.faction = faction;
    this.currentHp = this.maxHp;
    this.customOffsetX = 0;
    this.customOffsetY = 0;
    this.currentAlpha = 1.0;
    this.targetAlpha = 1.0;
    this.lodMode = 'full';
    this.intentGlyph = '';
    this.isIntentVisible = false;
    this.isDestroyed = false;
    this.resetRenderCache();
    this.acquireRenderObjects();
  }

  public update(
    x: number,
    y: number,
    currentHp: number,
    maxHp?: number,
    faction?: EntityFaction
  ): void {
    if (this.isDestroyed) return;

    this.x = x;
    this.y = y;
    if (maxHp !== undefined && maxHp > 0) this.maxHp = maxHp;
    if (faction !== undefined) this.faction = faction;
    this.currentHp = Math.max(0, Math.min(this.maxHp, currentHp));

    const effectiveX = this.x + this.customOffsetX;
    const effectiveY = this.y + this.customOffsetY;
    const barX = effectiveX - this.barWidth / 2;
    const barY = effectiveY + this.tier1_hp_y_offset;

    if (this.nameTag && this.nameTag.active) {
      this.nameTag.setPosition(effectiveX, effectiveY + this.tier2_name_y_offset);
    }
    if (this.indicator && this.indicator.active) {
      this.indicator.setPosition(effectiveX, effectiveY + this.tier3_intent_y_offset);
    }

    // Maintain continuous 2.5D dynamic depth synchronized with physical Y coordinate
    if (Number.isFinite(y)) {
      this.setDepth(RENDER_DEPTH.ENTITY_Y_BASE + y * RENDER_DEPTH.ENTITY_Y_SCALE);
    }

    this.renderHpBar(barX, barY);
  }

  public renderHpBar(barX: number, barY: number, force: boolean = false): void {
    if (!this.hpGraphics || !this.hpGraphics.active) return;

    const isVisible = (this.hpGraphics as unknown as { visible?: boolean }).visible !== false;
    if (
      !force &&
      this.currentHp === this.lastRenderedHp &&
      this.maxHp === this.lastRenderedMaxHp &&
      barX === this.lastRenderedBarX &&
      barY === this.lastRenderedBarY &&
      this.barWidth === this.lastRenderedWidth &&
      this.faction === this.lastRenderedFaction &&
      this.hpBarColor === this.lastRenderedColor &&
      isVisible === this.lastRenderedVisible
    ) {
      return;
    }

    this.lastRenderedHp = this.currentHp;
    this.lastRenderedMaxHp = this.maxHp;
    this.lastRenderedBarX = barX;
    this.lastRenderedBarY = barY;
    this.lastRenderedWidth = this.barWidth;
    this.lastRenderedFaction = this.faction;
    this.lastRenderedColor = this.hpBarColor;
    this.lastRenderedVisible = isVisible;

    if (typeof this.hpGraphics.clear !== 'function') return;
    this.hpGraphics.clear();
    if (!isVisible) return;

    if (this.currentHp > 0) {
      // Dark background bar
      this.hpGraphics.fillStyle(0x0f172a, 0.85);
      this.hpGraphics.fillRect(barX - 1, barY - 1, this.barWidth + 2, this.barHeight + 2);

      // Fill bar calculation
      const fillRatio = this.currentHp / this.maxHp;
      let fillColor: number;
      if (this.hpBarColor !== undefined) {
        fillColor = this.hpBarColor;
      } else if (this.faction === 'enemy') {
        fillColor = fillRatio > 0.5 ? 0xef4444 : 0xb91c1c;
      } else if (this.faction === 'ally') {
        fillColor = 0x06b6d4;
      } else {
        fillColor = 0xf59e0b;
      }

      this.hpGraphics.fillStyle(fillColor, 1.0);
      this.hpGraphics.fillRect(barX, barY, this.barWidth * fillRatio, this.barHeight);

      // Segment dividers for multi-HP entities
      if (this.maxHp > 1) {
        this.hpGraphics.lineStyle(1, 0x000000, 0.85);
        for (let i = 1; i < this.maxHp; i++) {
          const segX = barX + (this.barWidth / this.maxHp) * i;
          this.hpGraphics.lineBetween(segX, barY, segX, barY + this.barHeight);
        }
      }
    }
  }

  public setLODMode(mode: NameTagLODMode): void {
    if (this.isDestroyed) return;
    if (this.lodMode === mode) return;
    this.lodMode = mode;
    if (!this.nameTag || !this.nameTag.active) return;

    if (mode === 'minimal') {
      this.nameTag.setVisible(false);
    } else if (mode === 'compact') {
      this.nameTag.setText(this.compactName);
      this.nameTag.setVisible(true);
    } else {
      this.nameTag.setText(this.fullName);
      this.nameTag.setVisible(true);
    }
  }

  public setCustomOffsets(offsetX: number, offsetY: number): void {
    if (this.isDestroyed) return;
    if (this.customOffsetX === offsetX && this.customOffsetY === offsetY) return;
    this.customOffsetX = offsetX;
    this.customOffsetY = offsetY;
    const effectiveX = this.x + this.customOffsetX;
    const effectiveY = this.y + this.customOffsetY;
    const barX = effectiveX - this.barWidth / 2;
    const barY = effectiveY + this.tier1_hp_y_offset;

    if (this.nameTag && this.nameTag.active) {
      this.nameTag.setPosition(effectiveX, effectiveY + this.tier2_name_y_offset);
    }
    if (this.indicator && this.indicator.active) {
      this.indicator.setPosition(effectiveX, effectiveY + this.tier3_intent_y_offset);
    }
    this.renderHpBar(barX, barY);
  }

  public setAlpha(alpha: number): void {
    if (this.isDestroyed) return;
    const clampedAlpha = Number.isNaN(alpha) ? 1.0 : Math.max(0.0, Math.min(1.0, alpha));
    this.currentAlpha = clampedAlpha;
    if (this.hpGraphics && this.hpGraphics.active && typeof this.hpGraphics.setAlpha === 'function') {
      this.hpGraphics.setAlpha(clampedAlpha);
    }
    if (this.nameTag && this.nameTag.active && typeof this.nameTag.setAlpha === 'function') {
      this.nameTag.setAlpha(clampedAlpha);
    }
    if (this.indicator && this.indicator.active && typeof this.indicator.setAlpha === 'function') {
      this.indicator.setAlpha(clampedAlpha);
    }
  }

  public setDepth(baseDepth: number): void {
    if (this.isDestroyed) return;
    const safeDepth = Number.isFinite(baseDepth) ? baseDepth : RENDER_DEPTH.ENTITY_Y_BASE;
    if (this.hpGraphics && this.hpGraphics.active && typeof this.hpGraphics.setDepth === 'function') {
      this.hpGraphics.setDepth(safeDepth + RENDER_DEPTH.OFFSET_HP_BAR);
    }
    if (this.nameTag && this.nameTag.active && typeof this.nameTag.setDepth === 'function') {
      this.nameTag.setDepth(safeDepth + RENDER_DEPTH.OFFSET_NAME_TAG);
    }
    if (this.indicator && this.indicator.active && typeof this.indicator.setDepth === 'function') {
      this.indicator.setDepth(safeDepth + RENDER_DEPTH.OFFSET_INTENT_BADGE);
    }
  }

  public setIntent(glyph: string, visible: boolean = true): void {
    if (this.isDestroyed) return;
    this.intentGlyph = glyph;
    this.isIntentVisible = visible;
    if (this.indicator && this.indicator.active) {
      this.indicator.setText(glyph);
      this.indicator.setVisible(visible);
    }
  }

  public setVisible(visible: boolean): void {
    if (this.isDestroyed) return;
    if (this.hpGraphics && typeof this.hpGraphics.setVisible === 'function') {
      this.hpGraphics.setVisible(visible);
    }
    if (this.nameTag && typeof this.nameTag.setVisible === 'function') {
      this.nameTag.setVisible(visible && this.lodMode !== 'minimal');
    }
    if (this.indicator && typeof this.indicator.setVisible === 'function') {
      this.indicator.setVisible(visible && this.isIntentVisible);
    }
  }

  public getRenderLayers(includeOffsets: boolean = false): OverheadRenderLayers {
    const effectiveX = includeOffsets ? this.x + this.customOffsetX : this.x;
    const effectiveY = includeOffsets ? this.y + this.customOffsetY : this.y;
    const out = includeOffsets ? this._cachedRenderLayersOffset : this._cachedRenderLayersBase;
    out.tier1_hp.x = effectiveX - this.barWidth / 2;
    out.tier1_hp.y = effectiveY + this.tier1_hp_y_offset;
    out.tier1_hp.width = this.barWidth;
    out.tier1_hp.height = this.barHeight;
    out.tier1_hp.ratio = this.maxHp > 0 ? this.currentHp / this.maxHp : 0;
    out.tier1_hp.segments = this.maxHp;
    out.tier2_name.x = effectiveX;
    out.tier2_name.y = effectiveY + this.tier2_name_y_offset;
    out.tier2_name.text = this.name;
    out.tier2_name.color =
      this.faction === 'enemy'
        ? '#fb923c'
        : this.faction === 'ally'
          ? '#22d3ee'
          : '#fbbf24';
    out.tier3_intent.x = effectiveX;
    out.tier3_intent.y = effectiveY + this.tier3_intent_y_offset;
    out.tier3_intent.glyph = this.intentGlyph;
    out.tier3_intent.visible = this.isIntentVisible;
    return out;
  }

  public destroy(): void {
    this.isDestroyed = true;
    const sceneWithPool = this.scene as unknown as ISceneOverheadPools | undefined;
    if (this.hpGraphics) {
      if (
        this.hpGraphicsFromPool &&
        this.hpGraphicsPoolRef &&
        sceneWithPool?.graphicsPool === this.hpGraphicsPoolRef
      ) {
        this.hpGraphicsPoolRef.release(this.hpGraphics);
      } else if (typeof this.hpGraphics.destroy === 'function') {
        this.hpGraphics.destroy();
      }
      this.hpGraphics = null;
      this.hpGraphicsFromPool = false;
      this.hpGraphicsPoolRef = null;
    }
    if (this.nameTag) {
      if (
        this.nameTagFromPool &&
        this.nameTagPoolRef &&
        sceneWithPool?.nameTagTextPool === this.nameTagPoolRef
      ) {
        this.nameTagPoolRef.release(this.nameTag);
      } else if (typeof this.nameTag.destroy === 'function') {
        this.nameTag.destroy();
      }
      this.nameTag = null;
      this.nameTagFromPool = false;
      this.nameTagPoolRef = null;
    }
    if (this.indicator) {
      if (
        this.indicatorFromPool &&
        this.indicatorPoolRef &&
        sceneWithPool?.intentBadgeTextPool === this.indicatorPoolRef
      ) {
        this.indicatorPoolRef.release(this.indicator);
      } else if (typeof this.indicator.destroy === 'function') {
        this.indicator.destroy();
      }
      this.indicator = null;
      this.indicatorFromPool = false;
      this.indicatorPoolRef = null;
    }
  }
}
