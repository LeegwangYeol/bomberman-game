/**
 * OrbitalCrisis.ts — Orbital Bombardment Crisis (Stellaris Crisis 3)
 *
 * Sweeping targeting reticles, falling kinetic slugs leaving hazard craters,
 * Spinal Macrocannon central charge, and 3 Planetary Defense Uplink terminals.
 */

import { BaseCrisis } from './BaseCrisis.ts';
import { CrisisType, CrisisStage, HazardType } from './CrisisTypes.ts';
import { ROWS, COLS } from '../pathfinding.ts';
import { OrbitalCrisisAudio } from './OrbitalCrisisAudio.ts';

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
  private readonly craterPool: { r: number; c: number; remainingMs: number }[] = [];
  private readonly _obj0 = {
    id: 'dodge_salvos',
    title: 'Kinetic Evacuation',
    description: 'Evade patterned orbital kinetic slug bombardments',
    targetCount: 4,
    currentCount: 0,
    isCompleted: false,
  };
  private readonly _obj1 = {
    id: 'override_uplinks',
    title: 'Planetary Defense Uplinks',
    description: 'Detonate bombs on 3 Planetary Defense Uplinks to trigger counter-barrage (0/3)',
    targetCount: 3,
    currentCount: 0,
    isCompleted: false,
  };

  constructor() {
    super(CrisisType.ORBITAL_BOMBARDMENT);
    for (let i = 0; i < 16; i++) {
      this.craterPool.push({ r: 0, c: 0, remainingMs: 0 });
    }
    this.resetUplinksInPlace();
  }

  private resetDefaultObjectives(): void {
    this._obj0.id = 'dodge_salvos';
    this._obj0.title = 'Kinetic Evacuation';
    this._obj0.description = 'Evade patterned orbital kinetic slug bombardments';
    this._obj0.targetCount = 4;
    this._obj0.currentCount = 0;
    this._obj0.isCompleted = false;

    this._obj1.id = 'override_uplinks';
    this._obj1.title = 'Planetary Defense Uplinks';
    this._obj1.description = 'Detonate bombs on 3 Planetary Defense Uplinks to trigger counter-barrage (0/3)';
    this._obj1.targetCount = 3;
    this._obj1.currentCount = 0;
    this._obj1.isCompleted = false;

    this.objectives.length = 0;
    this.objectives.push(this._obj0, this._obj1);
  }

  private clearPendingCratersToPool(): void {
    while (this.pendingCraters.length > 0) {
      const item = this.pendingCraters.pop();
      if (item) {
        this.craterPool.push(item);
      }
    }
  }

  private resetUplinksInPlace(): void {
    if (this.uplinks.length === OrbitalCrisis.UPLINK_POSITIONS.length) {
      for (let i = 0; i < OrbitalCrisis.UPLINK_POSITIONS.length; i++) {
        const src = OrbitalCrisis.UPLINK_POSITIONS[i];
        const dst = this.uplinks[i];
        dst.r = src.r;
        dst.c = src.c;
        dst.isOverridden = false;
      }
    } else {
      this.uplinks = OrbitalCrisis.UPLINK_POSITIONS.map((u) => ({
        r: u.r,
        c: u.c,
        isOverridden: false,
      }));
    }
  }

  protected onInit(): void {
    OrbitalCrisisAudio.getInstance().reset();
    this.salvoTimerMs = 0;
    this.salvosEvadedCount = 0;
    this.macrocannonCharge = 0;
    this.clearPendingCratersToPool();
    this.resetUplinksInPlace();
    this.resetDefaultObjectives();
  }

  protected onStageEnter(stage: CrisisStage): void {
    OrbitalCrisisAudio.getInstance().playCrisisState(stage, this.threatMeter);

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
      for (let i = 0; i < this.uplinks.length; i++) {
        const u = this.uplinks[i];
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

      // Tick pending craters (Zero-GC swap-and-pop back to craterPool)
      for (let i = 0; i < this.pendingCraters.length; i++) {
        const p = this.pendingCraters[i];
        p.remainingMs -= deltaMs;
        if (p.remainingMs <= 0) {
          this.setHazardTile(p.r, p.c, HazardType.KINETIC_CRATER, 1.0, 3500, 0);
          OrbitalCrisisAudio.getInstance().playKineticCraterImpact();
          const last = this.pendingCraters.pop();
          if (last && i < this.pendingCraters.length) {
            this.pendingCraters[i] = last;
          }
          this.craterPool.push(p);
          i--;
        }
      }
    }

    if (this.stage === CrisisStage.CLIMAX) {
      // Macrocannon charges toward 100% over the climax duration (guard 0/0 NaN)
      const safeDuration = Number.isFinite(this.stageDurationMs) && this.stageDurationMs > 0 ? this.stageDurationMs : 1;
      const safeElapsed = Number.isFinite(this.stageElapsedMs) && this.stageElapsedMs >= 0 ? this.stageElapsedMs : 0;
      this.macrocannonCharge = Math.min(100, (safeElapsed / safeDuration) * 100);
      let overriddenCount = 0;
      for (let i = 0; i < this.uplinks.length; i++) {
        if (this.uplinks[i].isOverridden) overriddenCount++;
      }
      const uplinkMitigation = overriddenCount * 10;
      this.setThreat(Math.max(0, Math.floor(70 + (this.macrocannonCharge / 100) * 30 - uplinkMitigation)));
      OrbitalCrisisAudio.getInstance().playMacrocannonWhine(this.macrocannonCharge / 100);

      // If charged to 100% and not overridden, fail crisis
      if (this.macrocannonCharge >= 100 && !this.isVictorious) {
        OrbitalCrisisAudio.getInstance().playMacrocannonBeam();
        this.failCrisis('Spinal Macrocannon particle lance obliterated the surface sector!');
      }
    }
  }

  private static readonly SALVO_PATTERN: ReadonlyArray<Readonly<{ r: number; c: number }>> = Object.freeze([
    Object.freeze({ r: 3, c: 5 }),
    Object.freeze({ r: 3, c: 9 }),
    Object.freeze({ r: 9, c: 5 }),
    Object.freeze({ r: 9, c: 9 }),
  ]);

  public getMacrocannonCharge(): number {
    return this.macrocannonCharge;
  }

  private countOverriddenUplinks(): number {
    let count = 0;
    for (let i = 0; i < this.uplinks.length; i++) {
      if (this.uplinks[i].isOverridden) count++;
    }
    return count;
  }

  public spawnKineticSalvo(immediate: boolean = false): void {
    for (let i = 0; i < OrbitalCrisis.SALVO_PATTERN.length; i++) {
      const pt = OrbitalCrisis.SALVO_PATTERN[i];
      if (!this.isPerimeter(pt.r, pt.c)) {
        if (immediate) {
          this.setHazardTile(pt.r, pt.c, HazardType.KINETIC_CRATER, 1.0, 3500, 0);
          OrbitalCrisisAudio.getInstance().playKineticCraterImpact();
        } else {
          // Set telegraph target tile for 1.5s
          this.setHazardTile(pt.r, pt.c, HazardType.KINETIC_TARGET, 0.7, 1500, 0);
          OrbitalCrisisAudio.getInstance().playReticlePing();
          OrbitalCrisisAudio.getInstance().playAtmosphericScream();
          const crater = this.craterPool.pop() ?? { r: 0, c: 0, remainingMs: 0 };
          crater.r = pt.r;
          crater.c = pt.c;
          crater.remainingMs = 1500;
          this.pendingCraters.push(crater);
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

        const activeCount = this.countOverriddenUplinks();
        OrbitalCrisisAudio.getInstance().playUplinkSecured(activeCount);

        if (activeCount === 3) {
          OrbitalCrisisAudio.getInstance().playCounterBarrage();
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

  protected onResolveObjective(objectiveId: string, value?: number): void {
    void value;
    if (objectiveId === 'override_uplinks') {
      const activeCount = this.countOverriddenUplinks();
      this.adjustThreat(-8 * activeCount);
      let obj = null;
      for (let i = 0; i < this.objectives.length; i++) {
        if (this.objectives[i].id === 'override_uplinks') {
          obj = this.objectives[i];
          break;
        }
      }
      if (obj && obj.isCompleted && !this.isVictorious) {
        OrbitalCrisisAudio.getInstance().playCounterBarrage();
        this.resolveCrisis('Planetary defense grid activated! Counter-orbital EMP neutralized the dreadnought fleet!');
      }
    } else if (objectiveId === 'dodge_salvos') {
      this.adjustThreat(-5);
    }
  }

  protected override getExtraSerializedState(): Record<string, unknown> {
    return {
      salvoTimerMs: this.salvoTimerMs,
      salvosEvadedCount: this.salvosEvadedCount,
      macrocannonCharge: this.macrocannonCharge,
      uplinks: this.uplinks.map((u) => ({
        r: u.r,
        c: u.c,
        isOverridden: u.isOverridden,
      })),
      pendingCraters: this.pendingCraters.map((c) => ({
        r: c.r,
        c: c.c,
        remainingMs: c.remainingMs,
      })),
    };
  }

  protected override applyExtraSerializedState(extra: Record<string, unknown>): void {
    this.salvoTimerMs =
      typeof extra.salvoTimerMs === 'number' && Number.isFinite(extra.salvoTimerMs)
        ? Math.max(0, extra.salvoTimerMs)
        : 0;
    this.salvosEvadedCount =
      typeof extra.salvosEvadedCount === 'number' && Number.isFinite(extra.salvosEvadedCount)
        ? Math.max(0, Math.floor(extra.salvosEvadedCount))
        : 0;
    this.macrocannonCharge =
      typeof extra.macrocannonCharge === 'number' && Number.isFinite(extra.macrocannonCharge)
        ? Math.max(0, Math.min(100, extra.macrocannonCharge))
        : 0;
    this.resetUplinksInPlace();
    if (Array.isArray(extra.uplinks)) {
      const len = Math.min(this.uplinks.length, extra.uplinks.length);
      for (let i = 0; i < len; i++) {
        const src = extra.uplinks[i] as Partial<UplinkTerminal> | null;
        if (src && typeof src === 'object') {
          const dst = this.uplinks[i];
          if (typeof src.r === 'number' && Number.isInteger(src.r) && src.r >= 0 && src.r < ROWS) {
            dst.r = src.r;
          }
          if (typeof src.c === 'number' && Number.isInteger(src.c) && src.c >= 0 && src.c < COLS) {
            dst.c = src.c;
          }
          dst.isOverridden = Boolean(src.isOverridden);
        }
      }
    }
    this.clearPendingCratersToPool();
    if (Array.isArray(extra.pendingCraters)) {
      for (let i = 0; i < extra.pendingCraters.length; i++) {
        const src = extra.pendingCraters[i] as { r?: number; c?: number; remainingMs?: number } | null;
        if (
          src &&
          typeof src === 'object' &&
          typeof src.r === 'number' &&
          typeof src.c === 'number' &&
          Number.isInteger(src.r) &&
          Number.isInteger(src.c) &&
          src.r >= 0 &&
          src.r < ROWS &&
          src.c >= 0 &&
          src.c < COLS
        ) {
          const slot = this.craterPool.pop() || { r: 0, c: 0, remainingMs: 0 };
          slot.r = src.r;
          slot.c = src.c;
          slot.remainingMs =
            typeof src.remainingMs === 'number' && Number.isFinite(src.remainingMs)
              ? Math.max(0, src.remainingMs)
              : 1000;
          this.pendingCraters.push(slot);
        }
      }
    }
  }

  protected override onReset(): void {
    OrbitalCrisisAudio.getInstance().reset();
    this.salvoTimerMs = 0;
    this.salvosEvadedCount = 0;
    this.macrocannonCharge = 0;
    this.clearPendingCratersToPool();
    this.resetUplinksInPlace();
    this.objectives.length = 0;
  }

  public override reset(): void {
    super.reset();
  }
}
