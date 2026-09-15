import type Phaser from 'phaser';
import type { EntityFaction, OverheadRenderLayers } from './types.ts';

/**
 * 3-Tier Overhead UI Component for Bomberman Entities.
 * Tier 1 (y - 14): Segmented HP Bar (24x4px, segmented by maxHp)
 * Tier 2 (y - 22): Faction Name Tag (9px bold monospace with dark slate background)
 * Tier 3 (y - 34): Intent Badge / Emoji Indicator (13px bold centered)
 */
export class OverheadUI {
  public scene: Phaser.Scene | null;
  public name: string;
  public faction: EntityFaction;
  public maxHp: number;
  public currentHp: number;
  public barWidth: number;
  public barHeight: number;
  public hpBarColor?: number;

  public x: number = 0;
  public y: number = 0;
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
    this.faction = faction;
    this.maxHp = Math.max(1, maxHp);
    this.currentHp = this.maxHp;
    this.barWidth = barWidth;
    this.barHeight = 4;
    this.hpBarColor = hpBarColor;

    if (scene && scene.add) {
      // Tier 1: HP Bar Graphics
      if (typeof scene.add.graphics === 'function') {
        this.hpGraphics = scene.add.graphics();
        this.hpGraphics.setDepth(16);
      }

      // Tier 2: Name Tag Text
      const nameColor =
        faction === 'enemy' ? '#fb923c' : faction === 'ally' ? '#22d3ee' : '#fbbf24';

      if (typeof scene.add.text === 'function') {
        this.nameTag = scene.add
          .text(0, 0, name, {
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
          .setDepth(16);

        // Tier 3: Intent Indicator Badge
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
          .setDepth(17)
          .setVisible(false);
      }
    }
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

    const barX = this.x - this.barWidth / 2;
    const barY = this.y + this.tier1_hp_y_offset;

    if (this.nameTag && this.nameTag.active) {
      this.nameTag.setPosition(this.x, this.y + this.tier2_name_y_offset);
    }
    if (this.indicator && this.indicator.active) {
      this.indicator.setPosition(this.x, this.y + this.tier3_intent_y_offset);
    }

    if (this.hpGraphics && this.hpGraphics.active) {
      this.hpGraphics.clear();

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

  public getRenderLayers(): OverheadRenderLayers {
    return {
      tier1_hp: {
        x: this.x - this.barWidth / 2,
        y: this.y + this.tier1_hp_y_offset,
        width: this.barWidth,
        height: this.barHeight,
        ratio: this.maxHp > 0 ? this.currentHp / this.maxHp : 0,
        segments: this.maxHp,
      },
      tier2_name: {
        x: this.x,
        y: this.y + this.tier2_name_y_offset,
        text: this.name,
        color:
          this.faction === 'enemy'
            ? '#fb923c'
            : this.faction === 'ally'
            ? '#22d3ee'
            : '#fbbf24',
      },
      tier3_intent: {
        x: this.x,
        y: this.y + this.tier3_intent_y_offset,
        glyph: this.intentGlyph,
        visible: this.isIntentVisible,
      },
    };
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.hpGraphics && this.hpGraphics.active) {
      this.hpGraphics.destroy();
      this.hpGraphics = null;
    }
    if (this.nameTag && this.nameTag.active) {
      this.nameTag.destroy();
      this.nameTag = null;
    }
    if (this.indicator && this.indicator.active) {
      this.indicator.destroy();
      this.indicator = null;
    }
  }
}
