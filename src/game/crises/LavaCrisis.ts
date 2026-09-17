/**
 * LavaCrisis.ts — Creeping Lava Crisis (Stellaris Crisis 5)
 *
 * Advancing molten lava fissures, item/bomb incineration, obsidian solidification,
 * and central caldera pressure valve shutoff at (6, 7).
 */

import { BaseCrisis } from './BaseCrisis.ts';
import { CrisisType, CrisisStage, HazardType } from './CrisisTypes.ts';
import { ROWS, COLS } from '../pathfinding.ts';

export class LavaCrisis extends BaseCrisis {
  public static readonly CALDERA_VALVE = { r: 6, c: 7 };

  public lavaAdvanceTimerMs: number = 0;
  public lavaAdvanceIntervalMs: number = 8000; // Advancing inward every 8s
  public currentLavaRing: number = 1; // Creeps from outer ring inward
  public maxLavaRing: number = 5;

  public lavaTilesCount: number = 0;
  public obsidianSolidifiedCount: number = 0;
  public isCalderaSealed: boolean = false;

  constructor() {
    super(CrisisType.CREEPING_LAVA);
  }

  protected onInit(): void {
    this.lavaAdvanceTimerMs = 0;
    this.currentLavaRing = 1;
    this.lavaTilesCount = 0;
    this.obsidianSolidifiedCount = 0;
    this.isCalderaSealed = false;

    this.objectives = [
      {
        id: 'solidify_lava',
        title: 'Obsidian Bridges',
        description: 'Solidify advancing magma channels into obsidian with bomb blasts',
        targetCount: 4,
        currentCount: 0,
        isCompleted: false,
      },
      {
        id: 'seal_caldera',
        title: 'Caldera Pressure Valve',
        description: 'Detonate a bomb at the Central Pressure Valve (6, 7) to relieve tectonic pressure',
        targetCount: 1,
        currentCount: 0,
        isCompleted: false,
      },
    ];
  }

  protected onStageEnter(stage: CrisisStage): void {
    if (stage === CrisisStage.WHISPERS) {
      this.triggerAlert(
        'lava_whispers',
        'TECTONIC TREMORS DETECTED',
        'Low seismic rumble vibrating through the arena! Magma vents fracturing bedrock.',
        'info',
        '🌋',
        4000
      );
    } else if (stage === CrisisStage.OUTBREAK) {
      this.triggerAlert(
        'lava_outbreak',
        'MANTLE RUPTURE OCCURRED',
        'Molten lava breaching outer perimeter corridors! Creeping inward toward center!',
        'danger',
        '🔥',
        5000
      );
      this.advanceLavaRing();
    } else if (stage === CrisisStage.CLIMAX) {
      this.triggerAlert(
        'lava_climax',
        'CALDERA ERUPTION IMMINENT',
        'Central caldera opening at (6, 7)! Detonate bomb on Central Pressure Valve!',
        'critical',
        '💥',
        6000
      );

      // Deploy Caldera Valve at (6, 7)
      this.setHazardTile(
        LavaCrisis.CALDERA_VALVE.r,
        LavaCrisis.CALDERA_VALVE.c,
        HazardType.CALDERA_VALVE,
        0.9,
        0,
        0
      );
    }
  }

  protected onUpdate(deltaMs: number): void {
    if (this.stage === CrisisStage.OUTBREAK || this.stage === CrisisStage.CLIMAX) {
      this.lavaAdvanceTimerMs += deltaMs;
      if (this.lavaAdvanceTimerMs >= this.lavaAdvanceIntervalMs) {
        this.lavaAdvanceTimerMs = 0;
        this.advanceLavaRing();
      }

      // Threat rises as lava approaches center
      const threatFromRings = 35 + (this.currentLavaRing / this.maxLavaRing) * 55;
      this.setThreat(Math.max(this.threatMeter, Math.floor(threatFromRings)));
    }
  }

  public advanceLavaRing(): void {
    if (this.currentLavaRing >= this.maxLavaRing) return;

    const ring = this.currentLavaRing;
    // Ring coordinates: top row = ring, bottom row = ROWS - 1 - ring, left col = ring, right col = COLS - 1 - ring
    const top = ring;
    const bottom = ROWS - 1 - ring;
    const left = ring;
    const right = COLS - 1 - ring;

    // Fill ring perimeter with lava (skip pillars)
    for (let c = left; c <= right; c++) {
      this.igniteLavaTile(top, c);
      this.igniteLavaTile(bottom, c);
    }
    for (let r = top; r <= bottom; r++) {
      this.igniteLavaTile(r, left);
      this.igniteLavaTile(r, right);
    }

    this.currentLavaRing++;
  }

  private igniteLavaTile(r: number, c: number): void {
    if (this.isPillar(r, c) || this.isPerimeter(r, c)) return;
    const current = this.getHazardAt(r, c);
    if (current && current.type === HazardType.OBSIDIAN_BLOCK) return; // Obsidian resists lava

    this.setHazardTile(r, c, HazardType.LAVA_SURFACE, 1.0, 0, 0);
    this.lavaTilesCount++;
  }

  /**
   * Edge Case 13: Lava instantly incinerates placed bombs or dropped powerups.
   */
  public shouldIncinerateEntity(r: number, c: number): boolean {
    const h = this.getHazardAt(r, c);
    return h !== null && h.type === HazardType.LAVA_SURFACE;
  }

  protected onBombBlast(r: number, c: number, radius: number): void {
    // 1. Cool molten lava into solid obsidian blocks
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) + Math.abs(dc) <= radius) {
          const tr = r + dr;
          const tc = c + dc;
          const h = this.getHazardAt(tr, tc);
          if (h && h.type === HazardType.LAVA_SURFACE) {
            // Transform molten lava into walkable obsidian block
            this.setHazardTile(tr, tc, HazardType.OBSIDIAN_BLOCK, 0.6, 0, 0);
            this.obsidianSolidifiedCount++;
            this.resolveObjective('solidify_lava');
          }
        }
      }
    }

    // 2. Bomb detonating on Central Caldera Valve in Climax
    if (this.stage === CrisisStage.CLIMAX && !this.isCalderaSealed) {
      const dist = Math.abs(LavaCrisis.CALDERA_VALVE.r - r) + Math.abs(LavaCrisis.CALDERA_VALVE.c - c);
      if (dist <= radius) {
        this.isCalderaSealed = true;
        this.resolveObjective('seal_caldera');
        this.resolveCrisis('Central Caldera Pressure Valve sealed! Magma chambers safely cooled into obsidian bedrock!');
      }
    }
  }

  protected onResolveObjective(): void {
    // Handled in bomb blast
  }
}
