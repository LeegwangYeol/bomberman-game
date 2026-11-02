/**
 * RiftCrisis.ts — Dimensional Rifts Crisis (Stellaris Crisis 6)
 *
 * Subspace rifts, toroidal edge corridor wrap-around, entity teleportation,
 * and 3-spire Quantum Synchronization within 2.0s window.
 */

import { BaseCrisis } from './BaseCrisis.ts';
import { CrisisType, CrisisStage, HazardType } from './CrisisTypes.ts';
import { ROWS, COLS } from '../pathfinding.ts';
import { RiftCrisisAudio } from './RiftCrisisAudio.ts';

export interface DimensionalSpire {
  r: number;
  c: number;
  isPolarized: boolean;
  hitTimestampMs: number;
}

export class RiftCrisis extends BaseCrisis {
  public static readonly INITIAL_RIFT_POSITIONS = [
    { r: 3, c: 4 },
    { r: 6, c: 10 },
    { r: 9, c: 5 },
  ];

  public static readonly QUANTUM_SYNC_WINDOW_MS = 2000; // 2.0s window to close all 3 spires

  public rifts: { r: number; c: number }[] = [];
  public spires: DimensionalSpire[] = [];
  public isQuantumSyncActive: boolean = false;
  public quantumSyncTimerMs: number = 0;
  public phantomsActive: boolean = false;
  public warpsPerformedCount: number = 0;

  constructor() {
    super(CrisisType.DIMENSIONAL_RIFTS);
  }

  protected onInit(): void {
    RiftCrisisAudio.getInstance().reset();
    this.isQuantumSyncActive = false;
    this.quantumSyncTimerMs = 0;
    this.phantomsActive = false;
    this.warpsPerformedCount = 0;

    this.rifts = RiftCrisis.INITIAL_RIFT_POSITIONS.map((r) => ({ ...r }));
    this.spires = this.rifts.map((r) => ({
      r: r.r,
      c: r.c,
      isPolarized: false,
      hitTimestampMs: 0,
    }));

    this.objectives = [
      {
        id: 'navigate_rifts',
        title: 'Subspace Navigation',
        description: 'Navigate toroidal warp corridors and survive reality distortion',
        targetCount: 3,
        currentCount: 0,
        isCompleted: false,
      },
      {
        id: 'quantum_sync',
        title: 'Quantum Synchronization',
        description: 'Polarize all 3 Dimensional Spires with bomb blasts within 2.0s (0/3)',
        targetCount: 3,
        currentCount: 0,
        isCompleted: false,
      },
    ];
  }

  protected onStageEnter(stage: CrisisStage): void {
    RiftCrisisAudio.getInstance().playCrisisState(stage, this.threatMeter);

    if (stage === CrisisStage.WHISPERS) {
      this.triggerAlert(
        'rift_whispers',
        'REALITY MATRIX DESTABILIZING',
        'Spatial audio phasing and gravity flutter detected. Subspace tears imminent.',
        'info',
        '🌀',
        4000
      );
    } else if (stage === CrisisStage.OUTBREAK) {
      this.triggerAlert(
        'rift_outbreak',
        'WARP INVERSION MANIFESTED',
        '3 Subspace Rifts opened! Corridors now wrap toroidally across arena edges!',
        'warning',
        '🪞',
        5000
      );
      this.phantomsActive = true;

      // Deploy 3 Subspace Rifts
      for (const rift of this.rifts) {
        this.setHazardTile(rift.r, rift.c, HazardType.DIMENSIONAL_WARP, 0.8, 0, 0);
      }
    } else if (stage === CrisisStage.CLIMAX) {
      this.triggerAlert(
        'rift_climax',
        'SINGULARITY SPIRES EMERGED',
        '3 Dimensional Singularity Spires active! Execute Quantum Synchronization within 2.0s!',
        'critical',
        '🔮',
        6000
      );

      // Deploy 3 Spires at the rift loci
      for (const spire of this.spires) {
        this.setHazardTile(spire.r, spire.c, HazardType.QUANTUM_SPIRE, 1.0, 0, 0);
      }
    } else if (stage === CrisisStage.RESOLVED || stage === CrisisStage.FAILED || stage === CrisisStage.INACTIVE) {
      RiftCrisisAudio.getInstance().stop();
    }
  }

  protected onUpdate(deltaMs: number): void {
    if (this.isQuantumSyncActive) {
      this.quantumSyncTimerMs += deltaMs;
      if (this.quantumSyncTimerMs > RiftCrisis.QUANTUM_SYNC_WINDOW_MS) {
        // 2.0s window expired: Reset spires
        this.resetQuantumSync();
      }
    }
  }

  /**
   * Evaluates Edge Case 14: Entity displacement upon rift spawn.
   * If candidate (r, c) is occupied, shifts to nearest empty tile in Chebyshev radius 1.
   * Defensive against NaN, Infinity, negative, and out-of-bounds coordinates.
   */
  public resolveSafeSpawnLocation(
    candidateR: number,
    candidateC: number,
    isOccupiedFn?: (r: number, c: number) => boolean
  ): { r: number; c: number } {
    const safeCandidateR = Number.isFinite(candidateR)
      ? Math.max(1, Math.min(ROWS - 2, Math.floor(candidateR)))
      : 1;
    const safeCandidateC = Number.isFinite(candidateC)
      ? Math.max(1, Math.min(COLS - 2, Math.floor(candidateC)))
      : 1;

    if (!isOccupiedFn || !isOccupiedFn(safeCandidateR, safeCandidateC)) {
      return { r: safeCandidateR, c: safeCandidateC };
    }

    // Search 1-tile Chebyshev radius
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = safeCandidateR + dr;
        const nc = safeCandidateC + dc;
        if (this.isWalkableTile(nr, nc) && !isOccupiedFn(nr, nc)) {
          return { r: nr, c: nc };
        }
      }
    }

    return { r: safeCandidateR, c: safeCandidateC };
  }

  /**
   * Toroidal edge wrap-around logic:
   * Crossing top edge wraps to bottom, left edge wraps to right.
   * Sanitized against NaN, Infinity, and non-numeric inputs.
   */
  public wrapToroidalPosition(r: number, c: number): { r: number; c: number } {
    const validR = Number.isFinite(r) ? r : 1;
    const validC = Number.isFinite(c) ? c : 1;

    if (this.stage !== CrisisStage.OUTBREAK && this.stage !== CrisisStage.CLIMAX) {
      return { r: validR, c: validC };
    }

    let wrappedR = validR;
    let wrappedC = validC;

    if (validR <= 0) wrappedR = ROWS - 2;
    else if (validR >= ROWS - 1) wrappedR = 1;

    if (validC <= 0) wrappedC = COLS - 2;
    else if (validC >= COLS - 1) wrappedC = 1;

    return { r: wrappedR, c: wrappedC };
  }

  /**
   * Teleportation across subspace rifts:
   * Stepping onto a rift teleports to the next rift in the network.
   */
  public teleportThroughRift(r: number, c: number): { r: number; c: number } | null {
    if (!Number.isFinite(r) || !Number.isFinite(c)) return null;

    const safeR = Math.floor(r);
    const safeC = Math.floor(c);
    const idx = this.rifts.findIndex((rift) => rift.r === safeR && rift.c === safeC);
    if (idx === -1) return null;

    const nextIdx = (idx + 1) % this.rifts.length;
    this.warpsPerformedCount++;
    this.resolveObjective('navigate_rifts');
    RiftCrisisAudio.getInstance().playTeleport();
    return { ...this.rifts[nextIdx] };
  }

  protected onBombBlast(r: number, c: number, radius: number): void {
    if (this.stage !== CrisisStage.CLIMAX) return;
    if (!Number.isFinite(r) || !Number.isFinite(c) || !Number.isFinite(radius)) return;

    const safeR = Math.floor(r);
    const safeC = Math.floor(c);
    const safeRadius = Math.max(0, Math.floor(radius));

    let hitAny = false;
    for (const spire of this.spires) {
      if (spire.isPolarized) continue;

      const dist = Math.abs(spire.r - safeR) + Math.abs(spire.c - safeC);
      if (dist <= safeRadius) {
        spire.isPolarized = true;
        spire.hitTimestampMs = this.stageElapsedMs;
        hitAny = true;

        this.setHazardTile(spire.r, spire.c, HazardType.QUANTUM_SPIRE, 1.0, 0, 1); // 1 = Polarized
      }
    }

    if (hitAny) {
      if (!this.isQuantumSyncActive) {
        this.isQuantumSyncActive = true;
        this.quantumSyncTimerMs = 0;
      }

      const polarizedCount = this.spires.filter((s) => s.isPolarized).length;
      this.resolveObjective('quantum_sync', polarizedCount);
      RiftCrisisAudio.getInstance().playSpireSync(polarizedCount);

      if (polarizedCount === 3) {
        // Complete Quantum Synchronization!
        this.resolveCrisis('Quantum Synchronization achieved! Dimensional rifts collapsed and reality stabilized!');
      } else {
        this.triggerAlert(
          'spire_sync',
          'SPIRE POLARIZED',
          `Dimensional Spire locked (${polarizedCount}/3)! Sync window active (${(
            (RiftCrisis.QUANTUM_SYNC_WINDOW_MS - this.quantumSyncTimerMs) /
            1000
          ).toFixed(1)}s)!`,
          'warning',
          '🔮',
          1500
        );
      }
    }
  }

  private resetQuantumSync(): void {
    this.isQuantumSyncActive = false;
    this.quantumSyncTimerMs = 0;
    for (const spire of this.spires) {
      spire.isPolarized = false;
      this.setHazardTile(spire.r, spire.c, HazardType.QUANTUM_SPIRE, 0.7, 0, 0);
    }
    this.resolveObjective('quantum_sync', 0);
    RiftCrisisAudio.getInstance().playSyncLost();
    this.triggerAlert(
      'sync_lost',
      'QUANTUM DE-COHERENCE',
      'Synchronization window expired. Overload all 3 spires within 2.0s!',
      'warning',
      '⏱️',
      2000
    );
  }

  protected onResolveObjective(objectiveId: string, value?: number): void {
    void value;
    if (objectiveId === 'quantum_sync') {
      const polarizedCount = this.spires.filter((s) => s.isPolarized).length;
      this.adjustThreat(-8 * polarizedCount);
      const obj = this.objectives.find((o) => o.id === 'quantum_sync');
      if (obj && obj.isCompleted && !this.isVictorious) {
        this.resolveCrisis('Quantum Synchronization achieved! Dimensional rifts collapsed and reality stabilized!');
      }
    } else if (objectiveId === 'navigate_rifts') {
      this.adjustThreat(-5);
    }
  }

  protected override getExtraSerializedState(): Record<string, unknown> {
    return {
      isQuantumSyncActive: Boolean(this.isQuantumSyncActive),
      quantumSyncTimerMs:
        typeof this.quantumSyncTimerMs === 'number' && Number.isFinite(this.quantumSyncTimerMs)
          ? Math.max(0, this.quantumSyncTimerMs)
          : 0,
      phantomsActive: Boolean(this.phantomsActive),
      warpsPerformedCount:
        typeof this.warpsPerformedCount === 'number' && Number.isFinite(this.warpsPerformedCount)
          ? Math.max(0, Math.floor(this.warpsPerformedCount))
          : 0,
      spires: this.spires.map((s) => ({
        r: s.r,
        c: s.c,
        isPolarized: Boolean(s.isPolarized),
        hitTimestampMs:
          typeof s.hitTimestampMs === 'number' && Number.isFinite(s.hitTimestampMs)
            ? Math.max(0, s.hitTimestampMs)
            : 0,
      })),
      rifts: this.rifts.map((r) => ({ r: r.r, c: r.c })),
    };
  }

  protected override applyExtraSerializedState(extra: Record<string, unknown>): void {
    if (!extra || typeof extra !== 'object') {
      return;
    }

    // 1. Phantoms Active Flag
    this.phantomsActive = Boolean(extra.phantomsActive);

    // 2. Warps Performed Counter
    if (typeof extra.warpsPerformedCount === 'number' && Number.isFinite(extra.warpsPerformedCount)) {
      this.warpsPerformedCount = Math.max(0, Math.floor(extra.warpsPerformedCount));
    } else {
      this.warpsPerformedCount = 0;
    }

    // 3. Subspace Rifts Network Restoration
    if (Array.isArray(extra.rifts)) {
      const validRifts: { r: number; c: number }[] = [];
      for (const raw of extra.rifts) {
        if (!raw || typeof raw !== 'object') continue;
        const item = raw as Record<string, unknown>;
        const r = item.r;
        const c = item.c;
        if (
          typeof r === 'number' && typeof c === 'number' &&
          Number.isInteger(r) && Number.isInteger(c) &&
          r >= 0 && r < ROWS && c >= 0 && c < COLS
        ) {
          validRifts.push({ r, c });
        }
      }
      if (validRifts.length > 0) {
        this.rifts = validRifts;
      }
    }
    if (this.rifts.length === 0) {
      this.rifts = RiftCrisis.INITIAL_RIFT_POSITIONS.map((r) => ({ ...r }));
    }

    // 4. Dimensional Spires Restoration
    if (Array.isArray(extra.spires)) {
      const validSpires: DimensionalSpire[] = [];
      for (const raw of extra.spires) {
        if (!raw || typeof raw !== 'object') continue;
        const item = raw as Record<string, unknown>;
        const r = item.r;
        const c = item.c;
        if (
          typeof r === 'number' && typeof c === 'number' &&
          Number.isInteger(r) && Number.isInteger(c) &&
          r >= 0 && r < ROWS && c >= 0 && c < COLS
        ) {
          const isPolarized = Boolean(item.isPolarized);
          const hitTimestampMs =
            isPolarized && typeof item.hitTimestampMs === 'number' && Number.isFinite(item.hitTimestampMs)
              ? Math.max(0, item.hitTimestampMs)
              : 0;

          validSpires.push({
            r,
            c,
            isPolarized,
            hitTimestampMs,
          });
        }
      }
      if (validSpires.length > 0) {
        this.spires = validSpires;
      }
    }

    if (this.spires.length === 0) {
      this.spires = this.rifts.map((r) => ({
        r: r.r,
        c: r.c,
        isPolarized: false,
        hitTimestampMs: 0,
      }));
    }

    // 5. Quantum Sync Active & Timer
    this.isQuantumSyncActive = Boolean(extra.isQuantumSyncActive);
    if (this.isQuantumSyncActive) {
      if (typeof extra.quantumSyncTimerMs === 'number' && Number.isFinite(extra.quantumSyncTimerMs)) {
        this.quantumSyncTimerMs = Math.max(
          0,
          Math.min(RiftCrisis.QUANTUM_SYNC_WINDOW_MS, extra.quantumSyncTimerMs)
        );
      } else {
        this.quantumSyncTimerMs = 0;
      }
    } else {
      this.quantumSyncTimerMs = 0;
    }

    // 6. State Harmonization: Objectives & Hazard Tiles
    const polarizedCount = this.spires.filter((s) => s.isPolarized).length;
    const syncObj = this.objectives.find((o) => o.id === 'quantum_sync');
    if (syncObj) {
      syncObj.currentCount = polarizedCount;
      syncObj.isCompleted = polarizedCount >= syncObj.targetCount;
    }
    const navObj = this.objectives.find((o) => o.id === 'navigate_rifts');
    if (navObj && this.warpsPerformedCount > 0) {
      navObj.currentCount = Math.min(
        navObj.targetCount,
        Math.max(navObj.currentCount, this.warpsPerformedCount)
      );
      navObj.isCompleted = navObj.currentCount >= navObj.targetCount;
    }

    if (this.stage === CrisisStage.CLIMAX) {
      for (const spire of this.spires) {
        this.setHazardTile(
          spire.r,
          spire.c,
          HazardType.QUANTUM_SPIRE,
          spire.isPolarized ? 1.0 : 0.7,
          0,
          spire.isPolarized ? 1 : 0
        );
      }
    } else if (this.stage === CrisisStage.OUTBREAK) {
      for (const rift of this.rifts) {
        this.setHazardTile(rift.r, rift.c, HazardType.DIMENSIONAL_WARP, 0.8, 0, 0);
      }
    }
  }

  public override reset(): void {
    super.reset();
    RiftCrisisAudio.getInstance().reset();
    this.isQuantumSyncActive = false;
    this.quantumSyncTimerMs = 0;
    this.phantomsActive = false;
    this.warpsPerformedCount = 0;
    for (const spire of this.spires) {
      spire.isPolarized = false;
      spire.hitTimestampMs = 0;
    }
  }
}
