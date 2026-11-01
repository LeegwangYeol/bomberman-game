/**
 * LavaCrisis.ts — Creeping Lava Crisis (Stellaris Crisis 5)
 *
 * Advancing molten lava fissures, item/bomb incineration, obsidian solidification,
 * and central caldera pressure valve shutoff at (6, 7).
 */

import { BaseCrisis } from './BaseCrisis.ts';
import { CrisisType, CrisisStage, HazardType } from './CrisisTypes.ts';
import { ROWS, COLS } from '../pathfinding.ts';
import { LavaCrisisAudio } from './LavaCrisisAudio.ts';

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
    LavaCrisisAudio.getInstance().reset();
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
    LavaCrisisAudio.getInstance().playCrisisState(stage, this.threatMeter);

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
    } else if (stage === CrisisStage.RESOLVED || stage === CrisisStage.FAILED || stage === CrisisStage.INACTIVE) {
      LavaCrisisAudio.getInstance().stop();
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
    if (typeof this.currentLavaRing !== 'number' || !Number.isFinite(this.currentLavaRing)) {
      this.currentLavaRing = 1;
    }
    if (this.currentLavaRing >= this.maxLavaRing) return;

    LavaCrisisAudio.getInstance().playLavaAdvance();

    const ring = Math.floor(this.currentLavaRing);
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
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;
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
    if (!Number.isFinite(r) || !Number.isFinite(c) || r < 0 || r >= ROWS || c < 0 || c >= COLS) {
      return false;
    }
    const h = this.getHazardAt(Math.floor(r), Math.floor(c));
    return h !== null && h.type === HazardType.LAVA_SURFACE;
  }

  protected onBombBlast(r: number, c: number, radius: number): void {
    if (!Number.isFinite(r) || !Number.isFinite(c) || !Number.isFinite(radius)) return;

    const safeR = Math.floor(r);
    const safeC = Math.floor(c);
    const safeRadius = Math.max(0, Math.floor(radius));

    // 1. Cool molten lava into solid obsidian blocks
    for (let dr = -safeRadius; dr <= safeRadius; dr++) {
      for (let dc = -safeRadius; dc <= safeRadius; dc++) {
        if (Math.abs(dr) + Math.abs(dc) <= safeRadius) {
          const tr = safeR + dr;
          const tc = safeC + dc;
          const h = this.getHazardAt(tr, tc);
          if (h && h.type === HazardType.LAVA_SURFACE) {
            // Transform molten lava into walkable obsidian block
            this.setHazardTile(tr, tc, HazardType.OBSIDIAN_BLOCK, 0.6, 0, 0);
            this.obsidianSolidifiedCount++;
            this.resolveObjective('solidify_lava');
            LavaCrisisAudio.getInstance().playObsidianQuenched(this.obsidianSolidifiedCount);
          }
        }
      }
    }

    // 2. Bomb detonating on Central Caldera Valve in Climax
    if (this.stage === CrisisStage.CLIMAX && !this.isCalderaSealed) {
      const dist = Math.abs(LavaCrisis.CALDERA_VALVE.r - safeR) + Math.abs(LavaCrisis.CALDERA_VALVE.c - safeC);
      if (dist <= safeRadius) {
        this.isCalderaSealed = true;
        LavaCrisisAudio.getInstance().playCalderaSealed();
        this.resolveObjective('seal_caldera');
        this.resolveCrisis('Central Caldera Pressure Valve sealed! Magma chambers safely cooled into obsidian bedrock!');
      }
    }
  }

  protected onResolveObjective(objectiveId: string, value?: number): void {
    void value;
    if (objectiveId === 'solidify_lava') {
      this.adjustThreat(-3);
      const obj = this.objectives.find((o) => o.id === 'solidify_lava');
      if (obj && obj.isCompleted) {
        this.triggerAlert(
          'lava_cooled',
          'OBSIDIAN BRIDGES FORMED',
          'Advancing magma channels quenched into solid obsidian bedrock!',
          'info',
          '🪨',
          3000
        );
      }
    } else if (objectiveId === 'seal_caldera') {
      this.adjustThreat(-25);
      if (!this.isVictorious) {
        this.resolveCrisis('Central Caldera Pressure Valve sealed! Magma chambers safely cooled into obsidian bedrock!');
      }
    }
  }

  protected override getExtraSerializedState(): Record<string, unknown> {
    return {
      lavaAdvanceTimerMs: this.lavaAdvanceTimerMs,
      currentLavaRing: this.currentLavaRing,
      lavaTilesCount: this.lavaTilesCount,
      obsidianSolidifiedCount: this.obsidianSolidifiedCount,
      isCalderaSealed: this.isCalderaSealed,
    };
  }

  protected override applyExtraSerializedState(extra: Record<string, unknown>): void {
    if (typeof extra.lavaAdvanceTimerMs === 'number' && Number.isFinite(extra.lavaAdvanceTimerMs)) {
      this.lavaAdvanceTimerMs = Math.max(0, extra.lavaAdvanceTimerMs);
    }
    if (typeof extra.currentLavaRing === 'number' && Number.isFinite(extra.currentLavaRing)) {
      this.currentLavaRing = Math.max(1, Math.min(this.maxLavaRing, Math.floor(extra.currentLavaRing)));
    }
    if (typeof extra.lavaTilesCount === 'number' && Number.isFinite(extra.lavaTilesCount)) {
      this.lavaTilesCount = Math.max(0, Math.floor(extra.lavaTilesCount));
    }
    if (typeof extra.obsidianSolidifiedCount === 'number' && Number.isFinite(extra.obsidianSolidifiedCount)) {
      this.obsidianSolidifiedCount = Math.max(0, Math.floor(extra.obsidianSolidifiedCount));
    }
    this.isCalderaSealed = Boolean(extra.isCalderaSealed);
  }

  public override reset(): void {
    super.reset();
    LavaCrisisAudio.getInstance().reset();
    this.lavaAdvanceTimerMs = 0;
    this.currentLavaRing = 1;
    this.lavaTilesCount = 0;
    this.obsidianSolidifiedCount = 0;
    this.isCalderaSealed = false;
  }
}
