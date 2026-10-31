/**
 * SolarFlareCrisis.ts — Solar Flare Storm (Stellaris Crisis 4)
 *
 * Coronal Mass Ejection sweeps along cardinal corridors, pillar line-of-sight sheltering,
 * instant bomb flash-ignition, and 4 Thermal Coolant Vents.
 */

import { BaseCrisis } from './BaseCrisis.ts';
import { CrisisType, CrisisStage, HazardType } from './CrisisTypes.ts';
import { ROWS, COLS } from '../pathfinding.ts';
import { SolarFlareCrisisAudio } from './SolarFlareCrisisAudio.ts';

export interface ThermalVent {
  r: number;
  c: number;
  isCooled: boolean;
}

export class SolarFlareCrisis extends BaseCrisis {
  public static readonly THERMAL_VENTS = [
    { r: 3, c: 7 }, // North
    { r: 9, c: 7 }, // South
    { r: 6, c: 3 }, // West
    { r: 6, c: 11 }, // East
  ];

  public cmeIntervalMs: number = 13000;
  public cmeTimerMs: number = 0;
  public cmeWarningMs: number = 3000;
  public isCmeWarningActive: boolean = false;
  public isCmeSweeping: boolean = false;
  public cmeSweepDurationMs: number = 1200;
  public cmeSweepRemainingMs: number = 0;
  public sweepsSurvivedCount: number = 0;

  public vents: ThermalVent[] = [];

  constructor() {
    super(CrisisType.SOLAR_FLARES);
  }

  protected onInit(): void {
    SolarFlareCrisisAudio.getInstance().reset();
    this.cmeTimerMs = 0;
    this.isCmeWarningActive = false;
    this.isCmeSweeping = false;
    this.cmeSweepRemainingMs = 0;
    this.sweepsSurvivedCount = 0;

    this.vents = SolarFlareCrisis.THERMAL_VENTS.map((v) => ({
      r: v.r,
      c: v.c,
      isCooled: false,
    }));

    this.objectives = [
      {
        id: 'shelter_flares',
        title: 'Coronal Shielding',
        description: 'Take cover behind indestructible pillars during CME sweeps',
        targetCount: 3,
        currentCount: 0,
        isCompleted: false,
      },
      {
        id: 'cool_thermal_vents',
        title: 'Thermal Coolant Vents',
        description: 'Detonate bombs at 4 Thermal Coolant Vents to relieve core pressure (0/4)',
        targetCount: 4,
        currentCount: 0,
        isCompleted: false,
      },
    ];
  }

  protected onStageEnter(stage: CrisisStage): void {
    SolarFlareCrisisAudio.getInstance().playCrisisState(stage, this.threatMeter);

    if (stage === CrisisStage.WHISPERS) {
      this.triggerAlert(
        'solar_whispers',
        'SOLAR FLARE ACTIVITY RISING',
        'Golden coronal glow detected. High magnetic static surging through arena!',
        'info',
        '☀️',
        4000
      );
    } else if (stage === CrisisStage.OUTBREAK) {
      this.triggerAlert(
        'solar_outbreak',
        'CORONAL MASS EJECTION IMMINENT',
        'CME sweeps will flash through open corridors! Stand behind pillars for 100% cover!',
        'warning',
        '🔥',
        5000
      );
    } else if (stage === CrisisStage.CLIMAX) {
      this.triggerAlert(
        'solar_climax',
        'HELIOS SOLAR CORE UNSTABLE',
        'Critical thermal pressure! Cool 4 thermal vents with bomb blasts before blowout!',
        'critical',
        '💥',
        6000
      );

      for (const vent of this.vents) {
        this.setHazardTile(vent.r, vent.c, HazardType.THERMAL_VENT, 0.9, 0, 0);
      }
    } else if (stage === CrisisStage.RESOLVED || stage === CrisisStage.FAILED || stage === CrisisStage.INACTIVE) {
      this.isCmeSweeping = false;
      this.isCmeWarningActive = false;
      this.cmeTimerMs = 0;
      this.cmeSweepRemainingMs = 0;
      SolarFlareCrisisAudio.getInstance().stop();
    }
  }

  protected onUpdate(deltaMs: number): void {
    if (this.stage === CrisisStage.OUTBREAK || this.stage === CrisisStage.CLIMAX) {
      this.cmeTimerMs += deltaMs;

      // Warning 3s before sweep
      if (!this.isCmeWarningActive && this.cmeTimerMs >= this.cmeIntervalMs - this.cmeWarningMs) {
        this.isCmeWarningActive = true;
        SolarFlareCrisisAudio.getInstance().playCmeWarning();
        SolarFlareCrisisAudio.getInstance().playSolarWindDrone();
        this.triggerAlert(
          'cme_warning',
          'CORONAL SWEEP IN 3 SECONDS!',
          'Seek cover behind pillars! Exposed bombs will flash-ignite!',
          'danger',
          '⚠️',
          3000
        );
      }

      // Sweep initiation
      if (this.cmeTimerMs >= this.cmeIntervalMs) {
        this.cmeTimerMs = 0;
        this.isCmeWarningActive = false;
        this.triggerCmeSweep();
      } else if (this.isCmeSweeping) {
        this.cmeSweepRemainingMs -= deltaMs;
        if (this.cmeSweepRemainingMs <= 0) {
          this.endCmeSweep();
        }
      }
    }
  }

  public isThermalVent(r: number, c: number): boolean {
    return this.vents.some((v) => v.r === r && v.c === c);
  }

  public triggerCmeSweep(): void {
    this.isCmeSweeping = true;
    this.cmeSweepRemainingMs = this.cmeSweepDurationMs;
    SolarFlareCrisisAudio.getInstance().playCmeSweep();

    // Apply solar sweep hazards to all open (non-pillar) corridor rows and columns
    // In Climax stage, preserve thermal vent tiles so they are not wiped!
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (!this.isPillar(r, c)) {
          if (this.stage === CrisisStage.CLIMAX && this.isThermalVent(r, c)) {
            continue;
          }
          this.setHazardTile(r, c, HazardType.SOLAR_SWEEP, 1.0, this.cmeSweepDurationMs, 0);
        }
      }
    }

    this.triggerAlert(
      'cme_strike',
      'SOLAR SWEEP ACTIVE!',
      'Coronal wave raging through corridors! Exposed entities taking heat damage!',
      'critical',
      '🔥',
      1200
    );
  }

  public endCmeSweep(): void {
    this.isCmeSweeping = false;
    this.sweepsSurvivedCount++;
    this.resolveObjective('shelter_flares');

    // Clear solar sweep hazards
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        const h = this.getHazardAt(r, c);
        if (h && h.type === HazardType.SOLAR_SWEEP) {
          this.clearHazardTile(r, c);
        }
      }
    }

    // In Climax stage, guarantee thermal vent tiles are restored to their active/cooled states
    if (this.stage === CrisisStage.CLIMAX) {
      for (const vent of this.vents) {
        this.setHazardTile(vent.r, vent.c, HazardType.THERMAL_VENT, vent.isCooled ? 0.4 : 0.9, 0, vent.isCooled ? 1 : 0);
      }
    }
  }

  /**
   * Edge Case 11: Evaluates if an entity at (r, c) is safely sheltered behind a pillar.
   * Indestructible pillars (r % 2 === 0 && c % 2 === 0) cast shadows.
   */
  public isTileShelteredFromFlare(r: number, c: number): boolean {
    if (
      typeof r !== 'number' || typeof c !== 'number' ||
      !Number.isFinite(r) || !Number.isFinite(c) ||
      Number.isNaN(r) || Number.isNaN(c) ||
      r < 0 || r >= ROWS || c < 0 || c >= COLS
    ) {
      return false;
    }
    const row = Math.floor(r);
    const col = Math.floor(c);
    if (this.isPillar(row, col)) return true; // Inside/behind pillar
    // Check if adjacent orthogonal tile has a solid pillar shielding it
    const adjacentPillars = [
      this.isPillar(row - 1, col),
      this.isPillar(row + 1, col),
      this.isPillar(row, col - 1),
      this.isPillar(row, col + 1),
    ];
    return adjacentPillars.some((p) => p);
  }

  /**
   * Edge Case 12: Exposed bombs flash-ignite immediately during CME sweep.
   */
  public shouldFlashIgniteBomb(r: number, c: number): boolean {
    if (this.stage !== CrisisStage.OUTBREAK && this.stage !== CrisisStage.CLIMAX) {
      return false;
    }
    if (
      typeof r !== 'number' || typeof c !== 'number' ||
      !Number.isFinite(r) || !Number.isFinite(c) ||
      Number.isNaN(r) || Number.isNaN(c) ||
      r < 0 || r >= ROWS || c < 0 || c >= COLS
    ) {
      return false;
    }
    return this.isCmeSweeping && !this.isTileShelteredFromFlare(Math.floor(r), Math.floor(c));
  }

  public flashIgniteBomb(r: number, c: number): boolean {
    if (this.shouldFlashIgniteBomb(r, c)) {
      SolarFlareCrisisAudio.getInstance().playFlashIgnition();
      return true;
    }
    return false;
  }

  protected onBombBlast(r: number, c: number, radius: number): void {
    if (this.stage !== CrisisStage.CLIMAX) return;

    for (let i = 0; i < this.vents.length; i++) {
      const vent = this.vents[i];
      if (vent.isCooled) continue;

      const dist = Math.abs(vent.r - r) + Math.abs(vent.c - c);
      if (dist <= radius) {
        vent.isCooled = true;
        this.setHazardTile(vent.r, vent.c, HazardType.THERMAL_VENT, 0.4, 0, 1); // 1 = Cooled
        this.resolveObjective('cool_thermal_vents');

        const cooledCount = this.vents.filter((v) => v.isCooled).length;
        SolarFlareCrisisAudio.getInstance().playThermalVentPurged(cooledCount);

        if (cooledCount < 4) {
          this.triggerAlert(
            `vent_${i}`,
            'THERMAL VENT COOLED',
            `Coolant released at (${vent.r}, ${vent.c}) (${cooledCount}/4)!`,
            'info',
            '❄️',
            2500
          );
        }
      }
    }
  }

  protected onResolveObjective(objectiveId: string, value?: number): void {
    void value;
    if (objectiveId === 'cool_thermal_vents') {
      const cooledCount = this.vents.filter((v) => v.isCooled).length;
      this.adjustThreat(-6 * cooledCount);
      const obj = this.objectives.find((o) => o.id === 'cool_thermal_vents');
      if (obj && obj.isCompleted && !this.isVictorious) {
        SolarFlareCrisisAudio.getInstance().playHeliosStabilization();
        this.resolveCrisis('All 4 Thermal Vents cooled! Super-flare extinguished and stellar calm restored!');
      }
    } else if (objectiveId === 'shelter_flares') {
      this.adjustThreat(-5);
    }
  }

  protected override getExtraSerializedState(): Record<string, unknown> {
    return {
      cmeTimerMs: this.cmeTimerMs,
      isCmeWarningActive: this.isCmeWarningActive,
      isCmeSweeping: this.isCmeSweeping,
      cmeSweepRemainingMs: this.cmeSweepRemainingMs,
      sweepsSurvivedCount: this.sweepsSurvivedCount,
      vents: this.vents.map((v) => ({ r: v.r, c: v.c, isCooled: v.isCooled })),
    };
  }

  protected override applyExtraSerializedState(extra: Record<string, unknown>): void {
    if (typeof extra.cmeTimerMs === 'number' && Number.isFinite(extra.cmeTimerMs)) {
      this.cmeTimerMs = Math.max(0, extra.cmeTimerMs);
    }
    this.isCmeWarningActive = Boolean(extra.isCmeWarningActive);
    this.isCmeSweeping = Boolean(extra.isCmeSweeping);
    if (typeof extra.cmeSweepRemainingMs === 'number' && Number.isFinite(extra.cmeSweepRemainingMs)) {
      this.cmeSweepRemainingMs = Math.max(0, extra.cmeSweepRemainingMs);
    }
    if (typeof extra.sweepsSurvivedCount === 'number' && Number.isFinite(extra.sweepsSurvivedCount)) {
      this.sweepsSurvivedCount = Math.max(0, extra.sweepsSurvivedCount);
    }
    if (Array.isArray(extra.vents)) {
      for (const raw of extra.vents) {
        if (raw && typeof raw === 'object' && 'r' in raw && 'c' in raw) {
          const match = this.vents.find((v) => v.r === raw.r && v.c === raw.c);
          if (match) {
            match.isCooled = Boolean(raw.isCooled);
          }
        }
      }
    }
  }

  public override reset(): void {
    super.reset();
    SolarFlareCrisisAudio.getInstance().reset();
    this.cmeTimerMs = 0;
    this.isCmeWarningActive = false;
    this.isCmeSweeping = false;
    this.cmeSweepRemainingMs = 0;
    this.sweepsSurvivedCount = 0;
    this.vents = SolarFlareCrisis.THERMAL_VENTS.map((v) => ({
      r: v.r,
      c: v.c,
      isCooled: false,
    }));
  }
}
