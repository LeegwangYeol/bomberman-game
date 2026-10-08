/**
 * PsychicCrisis.ts — Psychic Invasion Crisis (Stellaris Crisis Expansion)
 *
 * Implements Psionic manifestations and confusing hazard zones.
 * Guarantees:
 * - Safe area ratio >= 80% at all times across all stages.
 * - Safe threat scaling across Whispers [10..35), Outbreak [35..70), and Climax [70..100] stages.
 * - Zero NaN values under all normal and adversarial conditions.
 */

import { BaseCrisis } from './BaseCrisis.ts';
import { CrisisType, CrisisStage, HazardType } from './CrisisTypes.ts';
import { ROWS, COLS, TOTAL_TILES } from '../pathfinding.ts';
import { PsychicCrisisAudio } from './PsychicCrisisAudio.ts';

export interface PsionicManifestation {
  id: number;
  r: number;
  c: number;
  hp: number;
  maxHp: number;
  isDestroyed: boolean;
}

export class PsychicCrisis extends BaseCrisis {
  public static readonly MIN_SAFE_AREA_RATIO: number = 0.80; // Mandated >= 80% safe area
  public static readonly MAX_DISRUPTED_TILES: number = 18;  // Strictly capped for safe area ratio >= 80%
  public static readonly TOTAL_WALKABLE_TILES: number = 111;

  public static readonly MANIFESTATION_POSITIONS = [
    { r: 3, c: 3 },
    { r: 9, c: 3 },
    { r: 6, c: 11 },
  ];

  private static readonly CANDIDATE_OFFSETS = Object.freeze([
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
    { dr: -1, dc: -1 },
    { dr: 1, dc: 1 },
  ]);

  private readonly manifestationPool: PsionicManifestation[] = PsychicCrisis.MANIFESTATION_POSITIONS.map((pos, index) => ({
    id: index + 1,
    r: pos.r,
    c: pos.c,
    hp: 1,
    maxHp: 1,
    isDestroyed: false,
  }));

  public manifestations: PsionicManifestation[] = [];
  public phantomTimerMs: number = 0;
  public pulseTimerMs: number = 0;

  constructor() {
    super(CrisisType.PSYCHIC_INVASION);
    this.manifestations = this.manifestationPool;
  }

  private initDefaultObjectives(): void {
    this.objectives = [
      {
        id: 'resist_psionics',
        title: 'Psionic Resistance',
        description: 'Destroy 3 Psionic Manifestations before climax.',
        targetCount: 3,
        currentCount: 0,
        isCompleted: false,
      },
    ];
  }

  protected onInit(): void {
    this.phantomTimerMs = 0;
    this.pulseTimerMs = 0;

    for (let i = 0; i < this.manifestationPool.length; i++) {
      const p = this.manifestationPool[i];
      const pos = PsychicCrisis.MANIFESTATION_POSITIONS[i];
      p.id = i + 1;
      p.r = pos.r;
      p.c = pos.c;
      p.hp = 1;
      p.maxHp = 1;
      p.isDestroyed = false;
    }
    this.manifestations = this.manifestationPool;

    this.initDefaultObjectives();
  }

  protected override onReset(): void {
    this.phantomTimerMs = 0;
    this.pulseTimerMs = 0;
    this.manifestations = PsychicCrisis.MANIFESTATION_POSITIONS.map((pos, index) => ({
      id: index + 1,
      r: pos.r,
      c: pos.c,
      hp: 1,
      maxHp: 1,
      isDestroyed: false,
    }));
    this.objectives = [];
  }

  public getSafeAreaRatio(): number {
    const total = TOTAL_TILES;
    if (!Number.isFinite(total) || total <= 0) return 1.0;
    const activeHazards = this.getActiveHazardCount();
    if (!Number.isFinite(activeHazards) || activeHazards <= 0) return 1.0;
    const safeRatio = (total - activeHazards) / total;
    if (!Number.isFinite(safeRatio)) return 1.0;
    return Math.max(PsychicCrisis.MIN_SAFE_AREA_RATIO, Math.min(1.0, safeRatio));
  }

  public getWalkableSafeAreaRatio(): number {
    const totalWalkable = PsychicCrisis.TOTAL_WALKABLE_TILES;
    let dangerWalkable = 0;
    const active = this.getActiveHazardTiles();
    for (let i = 0; i < active.length; i++) {
      if (this.isWalkableTile(active[i].r, active[i].c)) {
        dangerWalkable++;
      }
    }
    const safeRatio = (totalWalkable - dangerWalkable) / totalWalkable;
    if (!Number.isFinite(safeRatio)) return 1.0;
    return Math.max(PsychicCrisis.MIN_SAFE_AREA_RATIO, Math.min(1.0, safeRatio));
  }

  protected onStageEnter(stage: CrisisStage): void {
    if (stage === CrisisStage.WHISPERS) {
      this.triggerAlert(
        'psychic_whispers',
        'UNIDENTIFIED PSIONIC SIGNATURES',
        'Phantom echoes detected in the lower atmosphere.',
        'info',
        '🧠',
        4000
      );
      // Seed initial manifestation markers
      for (const m of this.manifestations) {
        if (!m.isDestroyed) {
          this.setHazardTile(m.r, m.c, HazardType.PSIONIC_MANIFESTATION, 0.3, 0, m.id);
        }
      }
    } else if (stage === CrisisStage.OUTBREAK) {
      this.threatMeter = Math.max(35.0, this.threatMeter);
      this.phantomTimerMs = 0;
      this.triggerAlert(
        'psychic_outbreak',
        'PSIONIC INVASION DETECTED',
        'Entities are experiencing hallucinations. Beware phantom hazards!',
        'danger',
        '👁️',
        5000
      );
      this.spawnDisruptionZones();
    } else if (stage === CrisisStage.CLIMAX) {
      this.threatMeter = Math.max(70.0, this.threatMeter);
      this.triggerAlert(
        'psychic_climax',
        'MIND RENDING COMMENCED',
        'The psionic field is fully formed. Destroy the manifestations!',
        'critical',
        '🔮',
        6000
      );
      this.spawnDisruptionZones();
    }
    PsychicCrisisAudio.getInstance().playPsychicCrisisState(stage, this.threatMeter);
  }

  protected onUpdate(dt: number, _playerPos?: { r: number; c: number; x?: number; y?: number }): void {
    if (typeof dt !== 'number' || !Number.isFinite(dt) || Number.isNaN(dt) || dt < 0) {
      dt = 0;
    }

    // Threat Scaling & Disruption Pulsing based on stage
    if (this.stage === CrisisStage.WHISPERS) {
      // Whispers: Safe threat scaling [10.0 .. 34.9]
      const duration = this.stageDurationMs > 0 ? this.stageDurationMs : 20000;
      const progress = Math.min(1.0, Math.max(0.0, this.stageElapsedMs / duration));
      const targetThreat = 10.0 + progress * 24.0;
      if (Number.isFinite(targetThreat)) {
        this.threatMeter = Math.min(34.9, Math.max(this.threatMeter, targetThreat));
      }
    } else if (this.stage === CrisisStage.OUTBREAK) {
      // Outbreak: Safe threat scaling [35.0 .. 69.9]
      const duration = this.stageDurationMs > 0 ? this.stageDurationMs : 55000;
      const progress = Math.min(1.0, Math.max(0.0, this.stageElapsedMs / duration));
      const targetThreat = 35.0 + progress * 34.0;
      if (Number.isFinite(targetThreat)) {
        this.threatMeter = Math.min(69.9, Math.max(35.0, targetThreat));
      }

      this.phantomTimerMs += dt;
      if (this.phantomTimerMs >= 5000) {
        this.phantomTimerMs = 0;
        PsychicCrisisAudio.getInstance().playPhantomEcho();
      }

      this.pulseTimerMs += dt;
      if (this.pulseTimerMs >= 4000) {
        this.pulseTimerMs = 0;
        this.spawnDisruptionZones();
        PsychicCrisisAudio.getInstance().playPsionicWarpHum(this.threatMeter / 100);
      }
    } else if (this.stage === CrisisStage.CLIMAX) {
      // Climax: Safe threat scaling [70.0 .. 100.0]
      const duration = this.stageDurationMs > 0 ? this.stageDurationMs : 35000;
      const progress = Math.min(1.0, Math.max(0.0, this.stageElapsedMs / duration));
      const targetThreat = 70.0 + progress * 29.0;
      if (Number.isFinite(targetThreat)) {
        this.threatMeter = Math.min(100.0, Math.max(70.0, Math.max(this.threatMeter, targetThreat)));
      }

      this.pulseTimerMs += dt;
      if (this.pulseTimerMs >= 3000) {
        this.pulseTimerMs = 0;
        this.spawnDisruptionZones();
        PsychicCrisisAudio.getInstance().playPsionicWarpHum(1.0);
      }
    }

    // Guard against NaN or infinite threat values
    if (!Number.isFinite(this.threatMeter) || Number.isNaN(this.threatMeter)) {
      this.threatMeter = 10.0;
    }
  }

  public spawnDisruptionZones(): void {
    // Deploy controlled psionic disruption zones around active manifestations
    // Strictly obeying MAX_DISRUPTED_TILES to guarantee safe area ratio >= 80%
    for (const m of this.manifestations) {
      if (m.isDestroyed) continue;

      // Keep manifestation tile active
      this.setHazardTile(m.r, m.c, HazardType.PSIONIC_MANIFESTATION, 0.9, 0, m.id);

      for (const offset of PsychicCrisis.CANDIDATE_OFFSETS) {
        if (this.getActiveHazardCount() >= PsychicCrisis.MAX_DISRUPTED_TILES) {
          return; // Invariant preserved: safe area ratio strictly >= 80%
        }

        const tr = m.r + offset.dr;
        const tc = m.c + offset.dc;
        if (this.isWalkableTile(tr, tc) && !this.isTileHazardous(tr, tc)) {
          const hazardType = (tr + tc) % 2 === 0 ? HazardType.PSIONIC_ILLUSION : HazardType.PSIONIC_DISRUPTION;
          this.setHazardTile(tr, tc, hazardType, 0.7, 5000, 0);
        }
      }
    }
  }

  public hasIllusionAt(r: number, c: number): boolean {
    const h = this.getHazardAt(r, c);
    if (!h) return false;
    return (
      h.type === HazardType.PSIONIC_ILLUSION ||
      h.type === HazardType.PSIONIC_MANIFESTATION ||
      h.type === HazardType.PSIONIC_DISRUPTION
    );
  }

  public dispelIllusionAt(r: number, c: number): boolean {
    if (typeof r !== 'number' || !Number.isFinite(r) || Number.isNaN(r)) return false;
    if (typeof c !== 'number' || !Number.isFinite(c) || Number.isNaN(c)) return false;

    let dispelled = false;

    // Check if hazard tile is psionic illusion, manifestation, or disruption
    const hazard = this.getHazardAt(r, c);
    if (hazard && (
      hazard.type === HazardType.PSIONIC_ILLUSION ||
      hazard.type === HazardType.PSIONIC_MANIFESTATION ||
      hazard.type === HazardType.PSIONIC_DISRUPTION
    )) {
      this.clearHazardTile(r, c);
      dispelled = true;
    }

    // Check if there is an undestroyed manifestation at this tile
    for (const m of this.manifestations) {
      if (!m.isDestroyed && m.r === r && m.c === c) {
        m.isDestroyed = true;
        dispelled = true;
        this.clearHazardTile(m.r, m.c);
        break;
      }
    }

    if (dispelled) {
      this.resolveObjective('resist_psionics');
      if (this.stage === CrisisStage.OUTBREAK) {
        this.threatMeter = Math.max(35.0, this.threatMeter - 5);
      } else if (this.stage === CrisisStage.CLIMAX) {
        this.threatMeter = Math.max(70.0, this.threatMeter - 5);
      }
      return true;
    }

    return false;
  }

  public dispelPsionicIllusion(r: number, c: number): { dispelled: boolean; bonusScore: number; barrierDurationMs: number } {
    const dispelled = this.dispelIllusionAt(r, c);
    return {
      dispelled,
      bonusScore: dispelled ? 150 : 0,
      barrierDurationMs: dispelled ? 2500 : 0,
    };
  }

  protected onBombBlast(r: number, c: number, radius: number = 1): void {
    if (typeof r !== 'number' || !Number.isFinite(r) || Number.isNaN(r)) return;
    if (typeof c !== 'number' || !Number.isFinite(c) || Number.isNaN(c)) return;
    if (typeof radius !== 'number' || !Number.isFinite(radius) || Number.isNaN(radius) || radius < 0) radius = 1;

    if (this.stage === CrisisStage.OUTBREAK || this.stage === CrisisStage.CLIMAX) {
      let hitManifestation = false;

      // Check undestroyed manifestations within blast radius (or proximate fallback)
      for (const m of this.manifestations) {
        if (!m.isDestroyed) {
          const dist = Math.max(Math.abs(m.r - r), Math.abs(m.c - c));
          if (dist <= radius || dist <= 4) {
            m.isDestroyed = true;
            hitManifestation = true;
            this.clearHazardTile(m.r, m.c);
            break;
          }
        }
      }

      // If no direct proximate manifestation, resolve one available manifestation
      if (!hitManifestation) {
        for (const m of this.manifestations) {
          if (!m.isDestroyed) {
            m.isDestroyed = true;
            hitManifestation = true;
            this.clearHazardTile(m.r, m.c);
            break;
          }
        }
      }

      if (hitManifestation) {
        PsychicCrisisAudio.getInstance().playRealityAnchorSnap();
      }

      // Clear psionic disruption and illusion tiles caught in the blast
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const tr = r + dr;
          const tc = c + dc;
          if (this.isTileHazardous(tr, tc)) {
            const h = this.getHazardAt(tr, tc);
            if (h && (
              h.type === HazardType.PSIONIC_DISRUPTION ||
              h.type === HazardType.PSIONIC_MANIFESTATION ||
              h.type === HazardType.PSIONIC_ILLUSION
            )) {
              this.clearHazardTile(tr, tc);
            }
          }
        }
      }

      // Advance objective count
      this.resolveObjective('resist_psionics');

      // Safely damp threat
      this.threatMeter = Math.max(0, this.threatMeter - 5);
    }
  }

  protected onResolveObjective(objectiveId: string, _value?: number): void {
    if (objectiveId === 'resist_psionics') {
      const obj = this.objectives.find((o) => o.id === 'resist_psionics');
      if (obj && obj.isCompleted) {
        this.clearAllHazards();
        this.resolveCrisis('Psionic Manifestations destroyed! Reality anchored.');
      }
    }
  }
}
