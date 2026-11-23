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
  private readonly _coordResultRing: Array<{ r: number; c: number }> = [
    { r: 1, c: 1 },
    { r: 1, c: 1 },
    { r: 1, c: 1 },
    { r: 1, c: 1 },
  ];
  private _coordRingCursor: number = 0;

  private writeCoordResult(r: number, c: number, out?: { r: number; c: number }): { r: number; c: number } {
    const slot = out ?? this._coordResultRing[this._coordRingCursor++ & 3];
    slot.r = r;
    slot.c = c;
    return slot;
  }

  constructor() {
    super(CrisisType.DIMENSIONAL_RIFTS);
  }

  private resetRiftsAndSpiresInPlace(): void {
    const initial = RiftCrisis.INITIAL_RIFT_POSITIONS;
    if (this.rifts.length === initial.length) {
      for (let i = 0; i < initial.length; i++) {
        this.rifts[i].r = initial[i].r;
        this.rifts[i].c = initial[i].c;
      }
    } else {
      this.rifts = initial.map((r) => ({ r: r.r, c: r.c }));
    }

    if (this.spires.length === this.rifts.length) {
      for (let i = 0; i < this.rifts.length; i++) {
        this.spires[i].r = this.rifts[i].r;
        this.spires[i].c = this.rifts[i].c;
        this.spires[i].isPolarized = false;
        this.spires[i].hitTimestampMs = 0;
      }
    } else {
      this.spires = this.rifts.map((r) => ({
        r: r.r,
        c: r.c,
        isPolarized: false,
        hitTimestampMs: 0,
      }));
    }
  }

  protected onInit(): void {
    RiftCrisisAudio.getInstance().reset();
    this.isQuantumSyncActive = false;
    this.quantumSyncTimerMs = 0;
    this.phantomsActive = false;
    this.warpsPerformedCount = 0;

    this.resetRiftsAndSpiresInPlace();

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
      for (let i = 0; i < this.rifts.length; i++) {
        const rift = this.rifts[i];
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
      for (let i = 0; i < this.spires.length; i++) {
        const spire = this.spires[i];
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
    isOccupiedFn?: (r: number, c: number) => boolean,
    out?: { r: number; c: number }
  ): { r: number; c: number } {
    const safeCandidateR = Number.isFinite(candidateR)
      ? Math.max(1, Math.min(ROWS - 2, Math.floor(candidateR)))
      : 1;
    const safeCandidateC = Number.isFinite(candidateC)
      ? Math.max(1, Math.min(COLS - 2, Math.floor(candidateC)))
      : 1;

    if (!isOccupiedFn || !isOccupiedFn(safeCandidateR, safeCandidateC)) {
      return this.writeCoordResult(safeCandidateR, safeCandidateC, out);
    }

    // Search 1-tile Chebyshev radius
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = safeCandidateR + dr;
        const nc = safeCandidateC + dc;
        if (this.isWalkableTile(nr, nc) && !isOccupiedFn(nr, nc)) {
          return this.writeCoordResult(nr, nc, out);
        }
      }
    }

    return this.writeCoordResult(safeCandidateR, safeCandidateC, out);
  }

  /**
   * Toroidal edge wrap-around logic:
   * Crossing top edge wraps to bottom, left edge wraps to right.
   * Sanitized against NaN, Infinity, and non-numeric inputs.
   */
  public wrapToroidalPosition(
    r: number,
    c: number,
    out?: { r: number; c: number }
  ): { r: number; c: number } {
    const validR = Number.isFinite(r) ? r : 1;
    const validC = Number.isFinite(c) ? c : 1;

    if (this.stage !== CrisisStage.OUTBREAK && this.stage !== CrisisStage.CLIMAX) {
      return this.writeCoordResult(validR, validC, out);
    }

    let wrappedR = validR;
    let wrappedC = validC;

    if (validR <= 0) wrappedR = ROWS - 2;
    else if (validR >= ROWS - 1) wrappedR = 1;

    if (validC <= 0) wrappedC = COLS - 2;
    else if (validC >= COLS - 1) wrappedC = 1;

    return this.writeCoordResult(wrappedR, wrappedC, out);
  }

  /**
   * Teleportation across subspace rifts:
   * Stepping onto a rift teleports to the next rift in the network.
   */
  public teleportThroughRift(
    r: number,
    c: number,
    out?: { r: number; c: number }
  ): { r: number; c: number } | null {
    if (!Number.isFinite(r) || !Number.isFinite(c)) return null;

    const safeR = Math.floor(r);
    const safeC = Math.floor(c);
    let idx = -1;
    for (let i = 0; i < this.rifts.length; i++) {
      if (this.rifts[i].r === safeR && this.rifts[i].c === safeC) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return null;

    const nextIdx = (idx + 1) % this.rifts.length;
    this.warpsPerformedCount++;
    this.resolveObjective('navigate_rifts');
    RiftCrisisAudio.getInstance().playTeleport();
    const target = this.rifts[nextIdx];
    return this.writeCoordResult(target.r, target.c, out);
  }

  protected onBombBlast(r: number, c: number, radius: number): void {
    if (this.stage !== CrisisStage.CLIMAX) return;
    if (!Number.isFinite(r) || !Number.isFinite(c) || !Number.isFinite(radius)) return;

    const safeR = Math.floor(r);
    const safeC = Math.floor(c);
    const safeRadius = Math.max(0, Math.floor(radius));

    let hitAny = false;
    for (let i = 0; i < this.spires.length; i++) {
      const spire = this.spires[i];
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

      const polarizedCount = this.countPolarizedSpires();
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

  private countPolarizedSpires(): number {
    let count = 0;
    for (let i = 0; i < this.spires.length; i++) {
      if (this.spires[i].isPolarized) count++;
    }
    return count;
  }

  private resetQuantumSync(): void {
    this.isQuantumSyncActive = false;
    this.quantumSyncTimerMs = 0;
    for (let i = 0; i < this.spires.length; i++) {
      const spire = this.spires[i];
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
      const polarizedCount = this.countPolarizedSpires();
      this.adjustThreat(-8 * polarizedCount);
      let obj = null;
      for (let i = 0; i < this.objectives.length; i++) {
        if (this.objectives[i].id === 'quantum_sync') {
          obj = this.objectives[i];
          break;
        }
      }
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

    // 3. Subspace Rifts Network Restoration (Zero-GC indexed in-place reuse)
    let restoredRiftCount = 0;
    if (Array.isArray(extra.rifts)) {
      for (let i = 0; i < extra.rifts.length; i++) {
        const raw = extra.rifts[i];
        if (!raw || typeof raw !== 'object') continue;
        const item = raw as Record<string, unknown>;
        const r = item.r;
        const c = item.c;
        if (
          typeof r === 'number' && typeof c === 'number' &&
          Number.isInteger(r) && Number.isInteger(c) &&
          r >= 0 && r < ROWS && c >= 0 && c < COLS
        ) {
          let slot = this.rifts[restoredRiftCount];
          if (!slot) {
            slot = { r, c };
            this.rifts.push(slot);
          } else {
            slot.r = r;
            slot.c = c;
          }
          restoredRiftCount++;
        }
      }
      if (restoredRiftCount > 0) {
        this.rifts.length = restoredRiftCount;
      }
    }
    if (restoredRiftCount === 0 && this.rifts.length === 0) {
      const initial = RiftCrisis.INITIAL_RIFT_POSITIONS;
      for (let i = 0; i < initial.length; i++) {
        this.rifts.push({ r: initial[i].r, c: initial[i].c });
      }
    }

    // 4. Dimensional Spires Restoration (Zero-GC indexed in-place reuse)
    let restoredSpireCount = 0;
    if (Array.isArray(extra.spires)) {
      for (let i = 0; i < extra.spires.length; i++) {
        const raw = extra.spires[i];
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

          let slot = this.spires[restoredSpireCount];
          if (!slot) {
            slot = { r, c, isPolarized, hitTimestampMs };
            this.spires.push(slot);
          } else {
            slot.r = r;
            slot.c = c;
            slot.isPolarized = isPolarized;
            slot.hitTimestampMs = hitTimestampMs;
          }
          restoredSpireCount++;
        }
      }
      if (restoredSpireCount > 0) {
        this.spires.length = restoredSpireCount;
      }
    }

    if (restoredSpireCount === 0 && this.spires.length === 0) {
      for (let i = 0; i < this.rifts.length; i++) {
        this.spires.push({
          r: this.rifts[i].r,
          c: this.rifts[i].c,
          isPolarized: false,
          hitTimestampMs: 0,
        });
      }
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
    let polarizedCount = 0;
    for (let i = 0; i < this.spires.length; i++) {
      if (this.spires[i].isPolarized) polarizedCount++;
    }
    let syncObj = null;
    let navObj = null;
    for (let i = 0; i < this.objectives.length; i++) {
      const o = this.objectives[i];
      if (o.id === 'quantum_sync') syncObj = o;
      else if (o.id === 'navigate_rifts') navObj = o;
    }
    if (syncObj) {
      syncObj.currentCount = polarizedCount;
      syncObj.isCompleted = polarizedCount >= syncObj.targetCount;
    }
    if (navObj && this.warpsPerformedCount > 0) {
      navObj.currentCount = Math.min(
        navObj.targetCount,
        Math.max(navObj.currentCount, this.warpsPerformedCount)
      );
      navObj.isCompleted = navObj.currentCount >= navObj.targetCount;
    }

    if (this.stage === CrisisStage.CLIMAX) {
      for (let i = 0; i < this.spires.length; i++) {
        const spire = this.spires[i];
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
      for (let i = 0; i < this.rifts.length; i++) {
        const rift = this.rifts[i];
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
    this.resetRiftsAndSpiresInPlace();
  }
}
