/**
 * OrbitalCrisis.ts — Orbital Bombardment Crisis (Stellaris Crisis 3)
 *
 * Sweeping targeting reticles, falling kinetic slugs leaving hazard craters,
 * Spinal Macrocannon central charge, and 3 Planetary Defense Uplink terminals.
 */

import { BaseCrisis } from './BaseCrisis.ts';
import { CrisisType, CrisisStage, HazardType } from './CrisisTypes.ts';

export interface UplinkTerminal {
  r: number;
  c: number;
  isOverridden: boolean;
}

export class OrbitalCrisis extends BaseCrisis {
  public static readonly UPLINK_POSITIONS = [
    { r: 1, c: 1 },
    { r: 1, c: 13 },
    { r: 11, c: 13 },
  ];

  public static readonly MACROCANNON_CENTER_R = 6;
  public static readonly MACROCANNON_CENTER_C = 7;

  public salvoTimerMs: number = 0;
  public salvoIntervalMs: number = 6000;
  public salvosEvadedCount: number = 0;

  public uplinks: UplinkTerminal[] = [];
  public macrocannonCharge: number = 0; // 0 to 100%
  public pendingCraters: { r: number; c: number; remainingMs: number }[] = [];

  constructor() {
    super(CrisisType.ORBITAL_BOMBARDMENT);
  }

  protected onInit(): void {
    this.salvoTimerMs = 0;
    this.salvosEvadedCount = 0;
    this.macrocannonCharge = 0;
    this.pendingCraters = [];

    this.uplinks = OrbitalCrisis.UPLINK_POSITIONS.map((u) => ({
      r: u.r,
      c: u.c,
      isOverridden: false,
    }));

    this.objectives = [
      {
        id: 'dodge_salvos',
        title: 'Kinetic Evacuation',
        description: 'Evade patterned orbital kinetic slug bombardments',
        targetCount: 4,
        currentCount: 0,
        isCompleted: false,
      },
      {
        id: 'override_uplinks',
        title: 'Planetary Defense Uplinks',
        description: 'Detonate bombs on 3 Planetary Defense Uplinks to trigger counter-barrage (0/3)',
        targetCount: 3,
        currentCount: 0,
        isCompleted: false,
      },
    ];
  }

  protected onStageEnter(stage: CrisisStage): void {
    if (stage === CrisisStage.WHISPERS) {
      this.triggerAlert(
        'orbital_whispers',
        'ORBITAL DREADNOUGHT SIGHTED',
        'Sweeping red laser reticles detected! Orbital kinetic batteries aligning.',
        'info',
        '🛰️',
        4000
      );
    } else if (stage === CrisisStage.OUTBREAK) {
      this.triggerAlert(
        'orbital_outbreak',
        'KINETIC BOMBARDMENT COMMENCED',
        'Heavy kinetic slugs falling in patterned salvos! Evade impact craters!',
        'danger',
        '☄️',
        5000
      );
      this.spawnKineticSalvo();
    } else if (stage === CrisisStage.CLIMAX) {
      this.triggerAlert(
        'orbital_climax',
        'SPINAL MACROCANNON CHARGING',
        'Particle lance targeting central 3x3 sector! Override 3 defense uplinks immediately!',
        'critical',
        '🚀',
        6000
      );

      // Deploy Uplink terminals
      for (const u of this.uplinks) {
        this.setHazardTile(u.r, u.c, HazardType.UPLINK_TERMINAL, 0.8, 0, 0);
      }

      // Telegraph central 3x3 Macrocannon strike zone
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const tr = OrbitalCrisis.MACROCANNON_CENTER_R + dr;
          const tc = OrbitalCrisis.MACROCANNON_CENTER_C + dc;
          this.setHazardTile(tr, tc, HazardType.KINETIC_TARGET, 0.4, 0, 0);
        }
      }
    }
  }

  protected onUpdate(deltaMs: number): void {
    if (this.stage === CrisisStage.OUTBREAK || this.stage === CrisisStage.CLIMAX) {
      this.salvoTimerMs += deltaMs;
      if (this.salvoTimerMs >= this.salvoIntervalMs) {
        this.salvoTimerMs = 0;
        this.spawnKineticSalvo();
        this.salvosEvadedCount++;
        this.resolveObjective('dodge_salvos');
      }

      // Tick pending craters
      for (let i = 0; i < this.pendingCraters.length; i++) {
        const p = this.pendingCraters[i];
        p.remainingMs -= deltaMs;
        if (p.remainingMs <= 0) {
          this.setHazardTile(p.r, p.c, HazardType.KINETIC_CRATER, 1.0, 3500, 0);
          this.pendingCraters.splice(i, 1);
          i--;
        }
      }
    }

    if (this.stage === CrisisStage.CLIMAX) {
      // Macrocannon charges toward 100% over the climax duration
      this.macrocannonCharge = Math.min(100, (this.stageElapsedMs / this.stageDurationMs) * 100);
      this.setThreat(Math.max(70, Math.floor(70 + (this.macrocannonCharge / 100) * 30)));

      // If charged to 100% and not overridden, fail crisis
      if (this.macrocannonCharge >= 100 && !this.isVictorious) {
        this.failCrisis('Spinal Macrocannon particle lance obliterated the surface sector!');
      }
    }
  }

  public spawnKineticSalvo(immediate: boolean = false): void {
    // Generate 4 patterned impact points
    const pattern = [
      { r: 3, c: 5 },
      { r: 3, c: 9 },
      { r: 9, c: 5 },
      { r: 9, c: 9 },
    ];

    for (const pt of pattern) {
      if (!this.isPerimeter(pt.r, pt.c)) {
        if (immediate) {
          this.setHazardTile(pt.r, pt.c, HazardType.KINETIC_CRATER, 1.0, 3500, 0);
        } else {
          // Set telegraph target tile for 1.5s
          this.setHazardTile(pt.r, pt.c, HazardType.KINETIC_TARGET, 0.7, 1500, 0);
          this.pendingCraters.push({ r: pt.r, c: pt.c, remainingMs: 1500 });
        }
      }
    }
  }

  protected onBombBlast(r: number, c: number, radius: number): void {
    if (this.stage !== CrisisStage.CLIMAX) return;

    for (let i = 0; i < this.uplinks.length; i++) {
      const u = this.uplinks[i];
      if (u.isOverridden) continue;

      const dist = Math.abs(u.r - r) + Math.abs(u.c - c);
      if (dist <= radius) {
        u.isOverridden = true;
        this.setHazardTile(u.r, u.c, HazardType.UPLINK_TERMINAL, 1.0, 0, 1); // 1 = Overridden
        this.resolveObjective('override_uplinks');

        const activeCount = this.uplinks.filter((up) => up.isOverridden).length;
        if (activeCount === 3) {
          this.resolveCrisis('Planetary defense grid activated! Counter-orbital EMP neutralized the dreadnought fleet!');
        } else {
          this.triggerAlert(
            `uplink_${i}`,
            'DEFENSE UPLINK SECURED',
            `Planetary terminal (${u.r}, ${u.c}) online (${activeCount}/3)!`,
            'info',
            '📡',
            2500
          );
        }
      }
    }
  }

  protected onResolveObjective(): void {
    // Handled in update and bomb blast
  }
}
