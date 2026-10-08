/**
 * WaveDirector.ts — Dynamic Wave, Crisis & Boss Director
 *
 * Orchestrates wave escalation, dynamic crisis wave triggers (including PsychicCrisis),
 * and epic boss encounters (including MutantFloraBoss) with Zero-GC per-frame updates.
 */

import { CrisisManager } from '../crises/CrisisManager.ts';
import { CrisisType, CrisisStage, type CrisisStatus } from '../crises/CrisisTypes.ts';
import { BaseBoss } from '../bosses/BaseBoss.ts';
import { BossState, type BossId } from '../bosses/BossTypes.ts';
import { MutantFloraBoss } from '../bosses/MutantFloraBoss.ts';
import { GummyBearBoss } from '../bosses/GummyBearBoss.ts';
import { HamsterBoss } from '../bosses/HamsterBoss.ts';
import { QueenBeeBoss } from '../bosses/QueenBeeBoss.ts';
import { ScalingEngine } from './ScalingEngine.ts';
import type { WaveScalingParameters, WaveMutator } from './ProgressionTypes.ts';

export const WaveType = {
  STANDARD: 'STANDARD',
  ELITE: 'ELITE',
  CRISIS: 'CRISIS',
  BOSS: 'BOSS',
  CRISIS_BOSS: 'CRISIS_BOSS',
} as const;

export type WaveType = typeof WaveType[keyof typeof WaveType];

export const WaveState = {
  IDLE: 'IDLE',
  PREPARING: 'PREPARING',
  ACTIVE: 'ACTIVE',
  CLEARED: 'CLEARED',
  FAILED: 'FAILED',
} as const;

export type WaveState = typeof WaveState[keyof typeof WaveState];

export interface WaveConfig {
  wave: number;
  type: WaveType;
  crisisType: CrisisType | null;
  bossId: BossId | string | null;
  scaling: WaveScalingParameters;
  mutators: WaveMutator[];
}

export interface WaveDirectorStatus {
  wave: number;
  state: WaveState;
  waveType: WaveType;
  activeCrisisType: CrisisType | null;
  activeBossId: string | null;
  isCrisisActive: boolean;
  isBossActive: boolean;
  crisisStatus: CrisisStatus | null;
  elapsedMs: number;
}

export type WaveDirectorEventListener = (data: unknown) => void;

export class WaveDirector {
  public static readonly CRISIS_ROTATION: readonly CrisisType[] = Object.freeze([
    CrisisType.PSYCHIC_INVASION,
    CrisisType.PASTEL_VOID,
    CrisisType.CLOCKWORK_REBELLION,
    CrisisType.ORBITAL_BOMBARDMENT,
    CrisisType.SOLAR_FLARES,
    CrisisType.CREEPING_LAVA,
    CrisisType.DIMENSIONAL_RIFTS,
  ]);

  public static readonly BOSS_ROTATION: readonly BossId[] = Object.freeze([
    'boss_mutant_flora',
    'king_gummy_bear',
    'captain_nibbles',
    'queen_bee_cupcake',
  ]);

  private currentWave: number = 1;
  private waveState: WaveState = WaveState.IDLE;
  private waveType: WaveType = WaveType.STANDARD;
  private crisisManager: CrisisManager;
  private activeBoss: BaseBoss | null = null;
  private activeCrisisType: CrisisType | null = null;
  private currentConfig: WaveConfig | null = null;
  private elapsedMs: number = 0;
  private readonly listeners: Map<string, Set<WaveDirectorEventListener>> = new Map();

  // Cached Zero-GC return status
  private readonly cachedStatus: WaveDirectorStatus = {
    wave: 1,
    state: WaveState.IDLE,
    waveType: WaveType.STANDARD,
    activeCrisisType: null,
    activeBossId: null,
    isCrisisActive: false,
    isBossActive: false,
    crisisStatus: null,
    elapsedMs: 0,
  };

  constructor(crisisManager?: CrisisManager) {
    this.crisisManager = crisisManager ?? new CrisisManager();
  }

  // --- Static Classification & Factories ---

  /**
   * Deterministically resolves wave classification.
   * Multiples of 10: CRISIS_BOSS (both Crisis and Boss active).
   * Multiples of 5: BOSS.
   * Multiples of 4 (or ending in 4 / 8): CRISIS.
   * Ending in 3 / 7: ELITE.
   * Otherwise: STANDARD.
   */
  public static determineWaveType(wave: number): WaveType {
    const safeWave = Number.isFinite(wave) ? Math.max(1, Math.floor(wave)) : 1;
    if (safeWave % 10 === 0) return WaveType.CRISIS_BOSS;
    if (safeWave % 5 === 0) return WaveType.BOSS;
    if (safeWave % 4 === 0 || safeWave % 10 === 4 || safeWave % 10 === 8) return WaveType.CRISIS;
    if (safeWave % 10 === 3 || safeWave % 10 === 7) return WaveType.ELITE;
    return WaveType.STANDARD;
  }

  public static isCrisisWave(wave: number): boolean {
    const type = WaveDirector.determineWaveType(wave);
    return type === WaveType.CRISIS || type === WaveType.CRISIS_BOSS;
  }

  public static isBossWave(wave: number): boolean {
    const type = WaveDirector.determineWaveType(wave);
    return type === WaveType.BOSS || type === WaveType.CRISIS_BOSS;
  }

  public static isCrisisBossWave(wave: number): boolean {
    return WaveDirector.determineWaveType(wave) === WaveType.CRISIS_BOSS;
  }

  /**
   * Selects which Crisis triggers on a given crisis wave.
   * Guarantees PsychicCrisis triggers dynamically and predictably across crisis waves.
   */
  public static selectCrisisForWave(wave: number): CrisisType {
    const safeWave = Number.isFinite(wave) ? Math.max(1, Math.floor(wave)) : 1;
    // Specifically designate wave 4 and wave 10 (and every 7th crisis wave) to PsychicCrisis
    if (safeWave === 4 || safeWave === 10 || safeWave % 28 === 4) {
      return CrisisType.PSYCHIC_INVASION;
    }
    const idx = Math.floor(safeWave / 4) % WaveDirector.CRISIS_ROTATION.length;
    return WaveDirector.CRISIS_ROTATION[idx] ?? CrisisType.PSYCHIC_INVASION;
  }

  /**
   * Selects which Boss triggers on a given boss wave.
   * Guarantees MutantFloraBoss triggers dynamically on Crisis Boss waves (Wave 10, 20, etc.)
   * and within the standard rotation.
   */
  public static selectBossForWave(wave: number): BossId {
    const safeWave = Number.isFinite(wave) ? Math.max(1, Math.floor(wave)) : 1;
    // Wave 10, 20 (CRISIS_BOSS) and designated flora waves feature MutantFloraBoss
    if (safeWave === 10 || safeWave === 20 || safeWave % 20 === 0) {
      return 'boss_mutant_flora';
    }
    if (safeWave === 5) return 'king_gummy_bear';
    if (safeWave === 15) return 'captain_nibbles';
    if (safeWave === 25) return 'queen_bee_cupcake';

    const bossIndex = Math.floor(safeWave / 5) % WaveDirector.BOSS_ROTATION.length;
    return WaveDirector.BOSS_ROTATION[bossIndex] ?? 'boss_mutant_flora';
  }

  /**
   * Instantiates the requested boss entity.
   */
  public static createBoss(bossId: string, startX: number = 300, startY: number = 260): BaseBoss {
    const normalized = (bossId || '').toLowerCase().trim();
    if (
      normalized === 'boss_mutant_flora' ||
      normalized === 'mutant_flora' ||
      normalized === 'verdant_terror'
    ) {
      return new MutantFloraBoss(startX, startY);
    }
    if (
      normalized === 'captain_nibbles' ||
      normalized === 'boss_hamster_nibbles' ||
      normalized === 'mecha_hamster'
    ) {
      return new HamsterBoss(startX, startY);
    }
    if (
      normalized === 'queen_bee_cupcake' ||
      normalized === 'boss_queen_bee' ||
      normalized === 'queen_mellifera'
    ) {
      return new QueenBeeBoss(startX, startY);
    }
    // Default to King Gummy Bear
    return new GummyBearBoss(startX, startY);
  }

  // --- Wave Control & Lifecycle ---

  public getCurrentWave(): number {
    return this.currentWave;
  }

  public getWaveState(): WaveState {
    return this.waveState;
  }

  public getWaveType(): WaveType {
    return this.waveType;
  }

  public getActiveBoss(): BaseBoss | null {
    return this.activeBoss;
  }

  public getActiveCrisisType(): CrisisType | null {
    return this.activeCrisisType;
  }

  public getCrisisManager(): CrisisManager {
    return this.crisisManager;
  }

  public getCurrentConfig(): WaveConfig | null {
    return this.currentConfig;
  }

  /**
   * Starts a new wave with full dynamic resolution of crises and bosses.
   */
  public startWave(targetWave?: number): WaveConfig {
    if (targetWave !== undefined && Number.isFinite(targetWave)) {
      this.currentWave = Math.max(1, Math.floor(targetWave));
    }

    this.elapsedMs = 0;
    this.waveType = WaveDirector.determineWaveType(this.currentWave);
    this.waveState = WaveState.ACTIVE;

    const scaling = ScalingEngine.calculateWaveParameters(this.currentWave);
    const mutators = scaling.mutators;

    let selectedCrisis: CrisisType | null = null;
    let selectedBossId: BossId | null = null;

    // 1. Resolve Crisis if applicable
    if (this.waveType === WaveType.CRISIS || this.waveType === WaveType.CRISIS_BOSS) {
      selectedCrisis = WaveDirector.selectCrisisForWave(this.currentWave);
      this.triggerCrisis(selectedCrisis);
    } else {
      // Dismiss any lingering crisis cleanly
      this.crisisManager.stopCrisis('reset');
      this.activeCrisisType = null;
    }

    // 2. Resolve Boss if applicable
    if (this.waveType === WaveType.BOSS || this.waveType === WaveType.CRISIS_BOSS) {
      selectedBossId = WaveDirector.selectBossForWave(this.currentWave);
      this.spawnBoss(selectedBossId);
    } else {
      this.dismissBoss();
    }

    this.currentConfig = {
      wave: this.currentWave,
      type: this.waveType,
      crisisType: selectedCrisis,
      bossId: selectedBossId,
      scaling,
      mutators,
    };

    this.emit('wave-started', this.currentConfig);
    return this.currentConfig;
  }

  /**
   * Explicitly triggers a crisis on the active wave.
   */
  public triggerCrisis(crisisType: CrisisType): void {
    this.activeCrisisType = crisisType;
    this.crisisManager.triggerCrisis(crisisType);
    const crisis = this.crisisManager.getActiveCrisis();
    this.emit('crisis-triggered', { crisisType, crisis });
  }

  /**
   * Explicitly spawns a boss on the active wave.
   */
  public spawnBoss(bossId: string, startX?: number, startY?: number): BaseBoss {
    this.dismissBoss();
    this.activeBoss = WaveDirector.createBoss(bossId, startX, startY);
    this.emit('boss-triggered', { bossId, boss: this.activeBoss });
    return this.activeBoss;
  }

  /**
   * Main simulation tick (Zero-GC).
   */
  public update(
    deltaMs: number,
    playerPos?: { x: number; y: number; r: number; c: number }
  ): WaveDirectorStatus {
    const safeDelta = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    this.elapsedMs += safeDelta;

    let crisisStatus: CrisisStatus | null = null;

    // 1. Update Crisis Manager
    if (this.activeCrisisType) {
      crisisStatus = this.crisisManager.update(safeDelta, playerPos);
      if (crisisStatus.isVictorious && crisisStatus.stage === CrisisStage.RESOLVED) {
        this.emit('crisis-resolved', { crisisType: this.activeCrisisType });
      } else if (crisisStatus.isDefeated && crisisStatus.stage === CrisisStage.FAILED) {
        this.emit('crisis-failed', { crisisType: this.activeCrisisType });
      }
    }

    // 2. Update Active Boss
    if (this.activeBoss) {
      const px = playerPos?.x ?? 300;
      const py = playerPos?.y ?? 260;
      this.activeBoss.update(safeDelta, px, py);
      if (this.activeBoss.bossState === BossState.DEFEATED) {
        this.emit('boss-defeated', { bossId: this.activeBoss.config.id, boss: this.activeBoss });
      }
    }

    // Populate cached Zero-GC status
    const s = this.cachedStatus;
    s.wave = this.currentWave;
    s.state = this.waveState;
    s.waveType = this.waveType;
    s.activeCrisisType = this.activeCrisisType;
    s.activeBossId = this.activeBoss ? this.activeBoss.config.id : null;
    s.isCrisisActive = this.activeCrisisType !== null && this.crisisManager.getActiveCrisis() !== null;
    s.isBossActive = this.activeBoss !== null && this.activeBoss.bossState !== BossState.DEFEATED;
    s.crisisStatus = crisisStatus;
    s.elapsedMs = this.elapsedMs;

    return s;
  }

  /**
   * Concludes the current wave and prepares progression to next wave.
   */
  public completeWave(): void {
    if (this.activeCrisisType) {
      this.crisisManager.stopCrisis('resolved');
    }
    this.dismissBoss();

    const completedWave = this.currentWave;
    this.waveState = WaveState.CLEARED;
    this.emit('wave-completed', { wave: completedWave, type: this.waveType });

    this.currentWave++;
  }

  public failWave(reason: string = 'Player Defeated'): void {
    this.waveState = WaveState.FAILED;
    this.emit('wave-failed', { wave: this.currentWave, reason });
  }

  public dismissBoss(): void {
    this.activeBoss = null;
  }

  public reset(): void {
    this.currentWave = 1;
    this.waveState = WaveState.IDLE;
    this.waveType = WaveType.STANDARD;
    this.activeCrisisType = null;
    this.currentConfig = null;
    this.elapsedMs = 0;
    this.dismissBoss();
    this.crisisManager.reset();
  }

  // --- Event Handling ---

  public on(event: string, listener: WaveDirectorEventListener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => this.off(event, listener);
  }

  public off(event: string, listener: WaveDirectorEventListener): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  private emit(event: string, data?: unknown): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(data);
        } catch (err) {
          console.error(`WaveDirector event "${event}" listener threw:`, err);
        }
      }
    }
  }
}
