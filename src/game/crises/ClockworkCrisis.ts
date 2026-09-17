/**
 * ClockworkCrisis.ts — Clockwork Toy Rebellion (Stellaris Crisis 2)
 *
 * Reinforced Brass Cogs, Row 6 & Col 7 Conveyor Belts, Periodic EMP Pulses,
 * and 4-Conduit Synchronized Dynamo Overload within 1.5s window.
 */

import { BaseCrisis } from './BaseCrisis.ts';
import { CrisisType, CrisisStage, HazardType } from './CrisisTypes.ts';
import { ROWS, COLS } from '../pathfinding.ts';

export interface DynamoConduit {
  r: number;
  c: number;
  isHit: boolean;
  hitTimestampMs: number;
}

export class ClockworkCrisis extends BaseCrisis {
  public static readonly CONVEYOR_ROW = 6;
  public static readonly CONVEYOR_COL = 7;
  public static readonly CONVEYOR_SPEED_PX = 80; // 80 px/s

  public static readonly DYNAMO_CONDUITS: { r: number; c: number }[] = [
    { r: 5, c: 7 }, // North of Titan
    { r: 7, c: 7 }, // South of Titan
    { r: 6, c: 6 }, // West of Titan
    { r: 6, c: 8 }, // East of Titan
  ];

  public static readonly COG_POSITIONS: { r: number; c: number }[] = [
    { r: 2, c: 2 },
    { r: 2, c: 12 },
    { r: 4, c: 4 },
    { r: 4, c: 10 },
    { r: 8, c: 4 },
    { r: 8, c: 10 },
    { r: 10, c: 2 },
    { r: 10, c: 12 },
  ];

  public static readonly SYNCHRO_TOLERANCE_MS = 1500; // 1.5s window for 4-way overload

  public empIntervalMs: number = 14000;
  public empTimerMs: number = 0;
  public empWarningMs: number = 2500;
  public isEmpWarningActive: boolean = false;
  public totalEmpPulsesFired: number = 0;

  // Dynamo Overload tracking
  public conduits: DynamoConduit[] = [];
  public overloadWindowTimerMs: number = 0;
  public isOverloadWindowActive: boolean = false;
  public bonusBombSlotsGranted: boolean = false;

  constructor() {
    super(CrisisType.CLOCKWORK_REBELLION);
  }

  protected onInit(): void {
    this.empTimerMs = 0;
    this.isEmpWarningActive = false;
    this.totalEmpPulsesFired = 0;
    this.bonusBombSlotsGranted = false;
    this.isOverloadWindowActive = false;
    this.overloadWindowTimerMs = 0;

    this.conduits = ClockworkCrisis.DYNAMO_CONDUITS.map((c) => ({
      r: c.r,
      c: c.c,
      isHit: false,
      hitTimestampMs: 0,
    }));

    this.objectives = [
      {
        id: 'survive_emp',
        title: 'Mechanical Overhaul',
        description: 'Survive conveyor belts and EMP pulses',
        targetCount: 3,
        currentCount: 0,
        isCompleted: false,
      },
      {
        id: 'dynamo_overload',
        title: 'Dynamo Overload',
        description: 'Execute synchronized 4-bomb blast across all 4 Dynamo conduits within 1.5s (0/4)',
        targetCount: 4,
        currentCount: 0,
        isCompleted: false,
      },
    ];
  }

  protected onStageEnter(stage: CrisisStage): void {
    if (stage === CrisisStage.WHISPERS) {
      this.triggerAlert(
        'clockwork_whispers',
        'TICKING PROTOCOL ACCELERATING',
        'Metronome speeding from 60 to 120 BPM! Translucent brass cogs detected.',
        'info',
        '⚙️',
        4000
      );
    } else if (stage === CrisisStage.OUTBREAK) {
      this.triggerAlert(
        'clockwork_outbreak',
        'THE GREAT OVERHAUL',
        'Conveyor belts active on Row 6 & Col 7! Beware periodic EMP pulses!',
        'warning',
        '🤖',
        5000
      );

      // Deploy 8 Reinforced Brass Cogs
      for (const pos of ClockworkCrisis.COG_POSITIONS) {
        this.setHazardTile(pos.r, pos.c, HazardType.BRASS_COG, 1.0, 0, 0);
      }

      // Deploy Conveyor Belts on Row 6 and Col 7
      for (let c = 1; c < COLS - 1; c++) {
        if (!this.isPillar(ClockworkCrisis.CONVEYOR_ROW, c)) {
          this.setHazardTile(ClockworkCrisis.CONVEYOR_ROW, c, HazardType.CONVEYOR_BELT, 0.7, 0, 1); // 1 = East
        }
      }
      for (let r = 1; r < ROWS - 1; r++) {
        if (!this.isPillar(r, ClockworkCrisis.CONVEYOR_COL)) {
          this.setHazardTile(r, ClockworkCrisis.CONVEYOR_COL, HazardType.CONVEYOR_BELT, 0.7, 0, 2); // 2 = South
        }
      }
    } else if (stage === CrisisStage.CLIMAX) {
      this.bonusBombSlotsGranted = true;
      this.triggerAlert(
        'clockwork_climax',
        'STEAM TOY TITAN ONLINE',
        'Overdrive Capacitors granted +3 bomb slots! Overload 4 Dynamo conduits within 1.5s!',
        'critical',
        '🦾',
        6000
      );

      // Place Dynamo Conduits around (6, 7)
      for (const conduit of this.conduits) {
        this.setHazardTile(conduit.r, conduit.c, HazardType.DYNAMO_CONDUIT, 0.9, 0, 0);
      }
    }
  }

  protected onUpdate(deltaMs: number): void {
    // 1. EMP pulse loop in Outbreak & Climax
    if (this.stage === CrisisStage.OUTBREAK || this.stage === CrisisStage.CLIMAX) {
      this.empTimerMs += deltaMs;

      if (!this.isEmpWarningActive && this.empTimerMs >= this.empIntervalMs - this.empWarningMs) {
        this.isEmpWarningActive = true;
        this.triggerAlert(
          'emp_warning',
          'EMP PULSE CHARGING',
          'Capacitor buildup detected! Disarm field imminent in 2.5s!',
          'warning',
          '⚡',
          2500
        );
      }

      if (this.empTimerMs >= this.empIntervalMs) {
        this.empTimerMs = 0;
        this.isEmpWarningActive = false;
        this.fireEmpPulse();
      }
    }

    // 2. Dynamo Overload synchro window in Climax
    if (this.isOverloadWindowActive) {
      this.overloadWindowTimerMs += deltaMs;
      if (this.overloadWindowTimerMs > ClockworkCrisis.SYNCHRO_TOLERANCE_MS) {
        // Window expired before all 4 were hit: Reset conduits
        this.resetConduitOverload();
      }
    }
  }

  public fireEmpPulse(): void {
    this.totalEmpPulsesFired++;
    this.resolveObjective('survive_emp');

    this.triggerAlert(
      'emp_pulse',
      'EMP PULSE DISCHARGED!',
      'Electromagnetic surge swept the arena! Vulnerable bomb fuses disrupted.',
      'danger',
      '⚡',
      2000
    );

    // Pulse visual effect along Row 6 & Col 7
    for (let c = 1; c < COLS - 1; c++) {
      this.setHazardTile(ClockworkCrisis.CONVEYOR_ROW, c, HazardType.EMP_PULSE, 1.0, 400, 0);
    }
    for (let r = 1; r < ROWS - 1; r++) {
      this.setHazardTile(r, ClockworkCrisis.CONVEYOR_COL, HazardType.EMP_PULSE, 1.0, 400, 0);
    }
  }

  /**
   * Evaluates Edge Case 10: Bomb interaction with EMP Pulse.
   * If bomb fuse <= 50ms, normal detonation executes.
   * If fuse > 100ms, bomb is disarmed and player capacity is refunded.
   */
  public evaluateBombEmpInteraction(bombFuseMs: number): { action: 'detonate' | 'disarm'; refundSlot: boolean } {
    if (bombFuseMs <= 50) {
      return { action: 'detonate', refundSlot: false };
    }
    return { action: 'disarm', refundSlot: true };
  }

  protected onBombBlast(r: number, c: number, radius: number): void {
    if (this.stage !== CrisisStage.CLIMAX) return;

    // Check hit on Dynamo Conduits
    let hitAny = false;
    for (const conduit of this.conduits) {
      if (conduit.isHit) continue;

      const dist = Math.abs(conduit.r - r) + Math.abs(conduit.c - c);
      if (dist <= radius) {
        conduit.isHit = true;
        conduit.hitTimestampMs = this.stageElapsedMs;
        hitAny = true;

        this.setHazardTile(conduit.r, conduit.c, HazardType.DYNAMO_CONDUIT, 1.0, 0, 1); // 1 = Charged
      }
    }

    if (hitAny) {
      if (!this.isOverloadWindowActive) {
        this.isOverloadWindowActive = true;
        this.overloadWindowTimerMs = 0;
      }

      const activeHits = this.conduits.filter((c) => c.isHit).length;
      this.resolveObjective('dynamo_overload', activeHits);

      if (activeHits === 4) {
        // Complete 4-way overload achieved!
        this.resolveCrisis('Dynamo Overload short-circuited the Steam Toy Titan and dismantled the mechanical rebellion!');
      } else {
        this.triggerAlert(
          'conduit_hit',
          'CONDUIT OVERCHARGED',
          `Dynamo Conduit hit (${activeHits}/4)! Overload window active (${(
            (ClockworkCrisis.SYNCHRO_TOLERANCE_MS - this.overloadWindowTimerMs) /
            1000
          ).toFixed(1)}s left)!`,
          'warning',
          '⚡',
          1500
        );
      }
    }
  }

  private resetConduitOverload(): void {
    this.isOverloadWindowActive = false;
    this.overloadWindowTimerMs = 0;
    for (const conduit of this.conduits) {
      conduit.isHit = false;
      this.setHazardTile(conduit.r, conduit.c, HazardType.DYNAMO_CONDUIT, 0.5, 0, 0);
    }
    this.resolveObjective('dynamo_overload', 0);
    this.triggerAlert(
      'overload_reset',
      'SYNCHRONIZATION WINDOW LOST',
      'Conduits discharged safely. Synchronize all 4 blasts within 1.5s!',
      'warning',
      '⏱️',
      2000
    );
  }

  protected onResolveObjective(): void {
    // Handled in bomb blast / emp
  }
}
