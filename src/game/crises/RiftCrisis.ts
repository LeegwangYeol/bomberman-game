/**
 * RiftCrisis.ts — Dimensional Rifts Crisis (Stellaris Crisis 6)
 *
 * Subspace rifts, toroidal edge corridor wrap-around, entity teleportation,
 * and 3-spire Quantum Synchronization within 2.0s window.
 */

import { BaseCrisis } from './BaseCrisis.ts';
import { CrisisType, CrisisStage, HazardType } from './CrisisTypes.ts';
import { ROWS, COLS } from '../pathfinding.ts';

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
   */
  public resolveSafeSpawnLocation(
    candidateR: number,
    candidateC: number,
    isOccupiedFn?: (r: number, c: number) => boolean
  ): { r: number; c: number } {
    if (!isOccupiedFn || !isOccupiedFn(candidateR, candidateC)) {
      return { r: candidateR, c: candidateC };
    }

    // Search 1-tile Chebyshev radius
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = candidateR + dr;
        const nc = candidateC + dc;
        if (this.isWalkableTile(nr, nc) && !isOccupiedFn(nr, nc)) {
          return { r: nr, c: nc };
        }
      }
    }

    return { r: candidateR, c: candidateC };
  }

  /**
   * Toroidal edge wrap-around logic:
   * Crossing top edge wraps to bottom, left edge wraps to right.
   */
  public wrapToroidalPosition(r: number, c: number): { r: number; c: number } {
    if (this.stage !== CrisisStage.OUTBREAK && this.stage !== CrisisStage.CLIMAX) {
      return { r, c };
    }

    let wrappedR = r;
    let wrappedC = c;

    if (r <= 0) wrappedR = ROWS - 2;
    else if (r >= ROWS - 1) wrappedR = 1;

    if (c <= 0) wrappedC = COLS - 2;
    else if (c >= COLS - 1) wrappedC = 1;

    return { r: wrappedR, c: wrappedC };
  }

  /**
   * Teleportation across subspace rifts:
   * Stepping onto a rift teleports to the next rift in the network.
   */
  public teleportThroughRift(r: number, c: number): { r: number; c: number } | null {
    const idx = this.rifts.findIndex((rift) => rift.r === r && rift.c === c);
    if (idx === -1) return null;

    const nextIdx = (idx + 1) % this.rifts.length;
    this.warpsPerformedCount++;
    this.resolveObjective('navigate_rifts');
    return { ...this.rifts[nextIdx] };
  }

  protected onBombBlast(r: number, c: number, radius: number): void {
    if (this.stage !== CrisisStage.CLIMAX) return;

    let hitAny = false;
    for (const spire of this.spires) {
      if (spire.isPolarized) continue;

      const dist = Math.abs(spire.r - r) + Math.abs(spire.c - c);
      if (dist <= radius) {
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
    this.triggerAlert(
      'sync_lost',
      'QUANTUM DE-COHERENCE',
      'Synchronization window expired. Overload all 3 spires within 2.0s!',
      'warning',
      '⏱️',
      2000
    );
  }

  protected onResolveObjective(): void {
    // Handled in bomb blast
  }
}
