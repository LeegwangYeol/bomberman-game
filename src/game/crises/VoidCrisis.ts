/**
 * VoidCrisis.ts — Pastel Void Incursion (Stellaris Crisis 1)
 *
 * Creeping void tiles, 4 cosmic rifts, 2 Purification Prisms with safe auras,
 * Supernova Cleanse, and Singularity Black Hole defeat condition.
 */

import { BaseCrisis } from './BaseCrisis.ts';
import { CrisisType, CrisisStage, HazardType } from './CrisisTypes.ts';
import { ROWS, COLS } from '../pathfinding.ts';

export interface PrismState {
  r: number;
  c: number;
  charge: number; // 0 to 100
  hits: number; // 0 to 3 hits to reach 100%
  isCharged: boolean;
}

export class VoidCrisis extends BaseCrisis {
  public static readonly RIFTS = [
    { r: 3, c: 3 },
    { r: 3, c: 11 },
    { r: 9, c: 3 },
    { r: 9, c: 11 },
  ];

  public static readonly PRISM_POSITIONS = [
    { r: 1, c: 13 },
    { r: 11, c: 1 },
  ];

  public static readonly SINGULARITY_THRESHOLD_TILES = 72; // 65% of walkable tiles
  public static readonly TOTAL_WALKABLE_TILES = 111;

  public prisms: PrismState[] = [];
  public voidCreepCount: number = 0;
  public creepTimerMs: number = 0;
  public baseCreepIntervalMs: number = 4000; // Creep spreads periodically

  // Avatar state in Climax
  public avatarSpawned: boolean = false;
  public avatarHp: number = 3;
  public avatarShieldActive: boolean = true;
  public supernovaCleansed: boolean = false;

  constructor() {
    super(CrisisType.PASTEL_VOID);
  }

  protected onInit(): void {
    this.voidCreepCount = 0;
    this.creepTimerMs = 0;
    this.avatarSpawned = false;
    this.avatarHp = 3;
    this.avatarShieldActive = true;
    this.supernovaCleansed = false;

    this.prisms = VoidCrisis.PRISM_POSITIONS.map((p) => ({
      r: p.r,
      c: p.c,
      charge: 0,
      hits: 0,
      isCharged: false,
    }));

    this.objectives = [
      {
        id: 'charge_prisms',
        title: 'Purification Prisms',
        description: 'Charge both corner Purification Prisms with bomb blasts (0/2)',
        targetCount: 2,
        currentCount: 0,
        isCompleted: false,
      },
      {
        id: 'defeat_avatar',
        title: 'Void Avatar',
        description: 'Shatter Iridescent Sugar Shield via Supernova Cleanse & defeat Avatar',
        targetCount: 1,
        currentCount: 0,
        isCompleted: false,
      },
    ];
  }

  protected onStageEnter(stage: CrisisStage): void {
    if (stage === CrisisStage.WHISPERS) {
      this.triggerAlert(
        'void_whispers',
        'VOID ANOMALIES DETECTED',
        'Violet subspace tears forming at 4 focal points! Prepare defenses.',
        'info',
        '🌀',
        4000
      );
      // Spawn 4 Void Rifts
      for (const rift of VoidCrisis.RIFTS) {
        this.setHazardTile(rift.r, rift.c, HazardType.VOID_RIFT, 0.5, 0, 0);
      }
      // Place initial prism markers
      for (const prism of this.prisms) {
        this.setHazardTile(prism.r, prism.c, HazardType.PURIFICATION_PRISM, 0.3, 0, 0);
      }
    } else if (stage === CrisisStage.OUTBREAK) {
      this.triggerAlert(
        'void_outbreak',
        'PASTEL VOID INCURSION',
        'Void creep devouring candy corridors! Charge Purification Prisms at (1,13) and (11,1)!',
        'danger',
        '🌌',
        5000
      );
      // Seed initial creep adjacent to rifts
      for (const rift of VoidCrisis.RIFTS) {
        this.spreadCreepFrom(rift.r, rift.c);
      }
    } else if (stage === CrisisStage.CLIMAX) {
      this.avatarSpawned = true;
      this.triggerAlert(
        'void_climax',
        'VOID DEVOURER AVATAR',
        'The Avatar has manifested at arena center with Iridescent Shield! Complete prism charging for Supernova Cleanse!',
        'critical',
        '🪐',
        6000
      );
    }
  }

  protected onUpdate(deltaMs: number): void {
    if (this.stage === CrisisStage.OUTBREAK || this.stage === CrisisStage.CLIMAX) {
      // Calculate creep speed factor based on charged prisms
      const chargedCount = this.prisms.filter((p) => p.isCharged).length;
      let speedMultiplier = 1.0;
      if (chargedCount === 1) speedMultiplier = 0.5; // -50% global creep speed
      else if (chargedCount >= 2) speedMultiplier = 0.0; // 100% frozen when both active!

      if (speedMultiplier > 0) {
        this.creepTimerMs += deltaMs;
        const effectiveInterval = this.baseCreepIntervalMs / speedMultiplier;
        if (this.creepTimerMs >= effectiveInterval) {
          this.creepTimerMs = 0;
          this.expandVoidCreep();
        }
      }

      // Check Singularity Threshold (65% of walkable tiles = 72 tiles)
      if (this.voidCreepCount >= VoidCrisis.SINGULARITY_THRESHOLD_TILES) {
        this.failCrisis('THE COSMOS WAS CONSUMED: Void Singularity collapsed the arena!');
        return;
      }

      // Dynamic Threat Meter: scales from 35% base to 100% as creep nears 72 tiles
      const creepThreat = Math.min(100, Math.floor(35 + (this.voidCreepCount / VoidCrisis.SINGULARITY_THRESHOLD_TILES) * 60));
      this.setThreat(Math.max(this.threatMeter, creepThreat));
    }
  }

  protected onBombBlast(r: number, c: number, radius: number): void {
    // 1. Check if blast hits any Purification Prism
    for (let i = 0; i < this.prisms.length; i++) {
      const prism = this.prisms[i];
      if (prism.isCharged) continue;

      const dist = Math.abs(prism.r - r) + Math.abs(prism.c - c);
      if (dist <= radius) {
        prism.hits++;
        prism.charge = Math.min(100, prism.hits * 34);
        this.setHazardTile(prism.r, prism.c, HazardType.PURIFICATION_PRISM, 0.5 + (prism.charge / 100) * 0.5, 0, prism.charge);

        if (prism.hits >= 3 || prism.charge >= 100) {
          prism.isCharged = true;
          prism.charge = 100;
          this.resolveObjective('charge_prisms');
          this.triggerAlert(
            `prism_${i}`,
            'PRISM FULLY CHARGED!',
            `Purification Prism at (${prism.r}, ${prism.c}) activated safe aura and slowed void expansion!`,
            'info',
            '💎',
            3000
          );
          // Purge any creep inside 3x3 aura around this prism
          this.cleanseAura(prism.r, prism.c, 1);
        }

        // Check if both prisms are now charged
        const allCharged = this.prisms.every((p) => p.isCharged);
        if (allCharged && !this.supernovaCleansed) {
          this.triggerSupernovaCleanse();
        }
      }
    }

    // 2. Blast purges void creep in range
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) + Math.abs(dc) <= radius) {
          const tr = r + dr;
          const tc = c + dc;
          const h = this.getHazardAt(tr, tc);
          if (h && h.type === HazardType.VOID_CREEP) {
            this.clearHazardTile(tr, tc);
            this.voidCreepCount = Math.max(0, this.voidCreepCount - 1);
          }
        }
      }
    }

    // 3. Blast hitting Avatar at center (6, 7)
    if (this.avatarSpawned && !this.avatarShieldActive) {
      const avatarDist = Math.abs(6 - r) + Math.abs(7 - c);
      if (avatarDist <= radius) {
        this.avatarHp--;
        if (this.avatarHp <= 0) {
          this.resolveObjective('defeat_avatar', 1);
          this.resolveCrisis('Supernova Cleanse shattered the Void Avatar and purified the cosmos!');
        } else {
          this.triggerAlert('avatar_hit', 'AVATAR STRUCK', `Void Avatar damaged! ${this.avatarHp} HP remaining!`, 'warning', '💥', 2000);
        }
      }
    }
  }

  public triggerSupernovaCleanse(): void {
    this.supernovaCleansed = true;
    this.avatarShieldActive = false;

    // Cleanse all void creep
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const h = this.getHazardAt(r, c);
        if (h && h.type === HazardType.VOID_CREEP) {
          this.clearHazardTile(r, c);
        }
      }
    }
    this.voidCreepCount = 0;
    this.adjustThreat(-40);

    this.triggerAlert(
      'supernova_cleanse',
      'SUPERNOVA CLEANSE ACTIVATED!',
      'Cosmic light vaporized all void creep! The Avatar\'s Iridescent Shield is shattered!',
      'info',
      '✨',
      5000
    );
  }

  private cleanseAura(centerR: number, centerC: number, radius: number): void {
    for (let r = centerR - radius; r <= centerR + radius; r++) {
      for (let c = centerC - radius; c <= centerC + radius; c++) {
        const h = this.getHazardAt(r, c);
        if (h && h.type === HazardType.VOID_CREEP) {
          this.clearHazardTile(r, c);
          this.voidCreepCount = Math.max(0, this.voidCreepCount - 1);
        }
      }
    }
  }

  private spreadCreepFrom(r: number, c: number): void {
    const neighbors = [
      { r: r - 1, c },
      { r: r + 1, c },
      { r: r - 1, c: c - 1 },
      { r: r + 1, c: c + 1 },
      { r, c: c - 1 },
      { r, c: c + 1 },
    ];

    for (const n of neighbors) {
      if (this.canCreepSpreadTo(n.r, n.c)) {
        this.setHazardTile(n.r, n.c, HazardType.VOID_CREEP, 0.8, 0, 0);
        this.voidCreepCount++;
        break;
      }
    }
  }

  private expandVoidCreep(): void {
    // Find all existing creep or rifts and expand to an adjacent walkable tile
    const active = this.getActiveHazardTiles();
    for (let i = 0; i < active.length; i++) {
      const tile = active[i];
      if (tile.type === HazardType.VOID_CREEP || tile.type === HazardType.VOID_RIFT) {
        const dirs = [
          { dr: -1, dc: 0 },
          { dr: 1, dc: 0 },
          { dr: 0, dc: -1 },
          { dr: 0, dc: 1 },
        ];
        for (const d of dirs) {
          const nr = tile.r + d.dr;
          const nc = tile.c + d.dc;
          if (this.canCreepSpreadTo(nr, nc)) {
            this.setHazardTile(nr, nc, HazardType.VOID_CREEP, 0.8, 0, 0);
            this.voidCreepCount++;
            return; // 1 tile per interval
          }
        }
      }
    }
  }

  public canCreepSpreadTo(r: number, c: number): boolean {
    if (!this.isWalkableTile(r, c)) return false; // Edge Case 7: Perimeter walls are IMMUNE
    if (this.isTileHazardous(r, c)) return false;

    // Check prism safe auras (3x3 area around charged prisms)
    for (const prism of this.prisms) {
      if (prism.isCharged) {
        if (Math.abs(prism.r - r) <= 1 && Math.abs(prism.c - c) <= 1) {
          return false;
        }
      }
    }

    return true;
  }

  protected onResolveObjective(): void {
    // Handled in bomb blast
  }
}
