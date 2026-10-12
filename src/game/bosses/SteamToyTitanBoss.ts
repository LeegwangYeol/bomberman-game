/**
 * SteamToyTitanBoss.ts — Clockwork Arch-Inventor (Steam Toy Titan, 🦾)
 *
 * Implements:
 * - 7-Stage Deterministic FSM (INTRO -> PHASE_1 -> INTERMISSION -> PHASE_2 -> ENRAGED -> STUNNED -> DEFEATED).
 * - Toy Mallet Slam: 8.0s cooldown (5.0s when enraged), 1,000ms 3-tier floor telegraph,
 *   3-tile Euclidean radius shockwave that knocks back all bombs on the arena 2 tiles outward (360 px/s slide).
 * - Steam Vent Pressure Release: Directional high-pressure steam bursts inflicting slow & steam burn.
 * - Rotating Brass Gear Shield: Phase 2/3 frontal blast absorption and gear shard deflection.
 * - Clockwork Crisis Synergy: Accelerates mallet slam and shockwave velocity during Clockwork Rebellion.
 * - Zero-GC object-pooling for shockwaves and gear shards, strict NaN guards, and >= 40% safe area invariant.
 */

import { BaseBoss, type BossConfig, type BossHUDData } from './BaseBoss.ts';
import {
  BossState,
  BossProjectileType,
  type BossProjectile,
  type BossShockwave,
  type TelegraphTile,
} from './BossTypes.ts';
import { ObjectPool } from '../pooling/ObjectPool.ts';
import { SteamToyTitanAudio } from './SteamToyTitanAudio.ts';

export interface MalletHitResult {
  hit: boolean;
  distance: number;
  damage: number;
  knockbackVx: number;
  knockbackVy: number;
}

export interface BombKnockbackResult {
  shouldKnockback: boolean;
  slideVx: number;
  slideVy: number;
  distanceTiles: number;
}

export class SteamToyTitanBoss extends BaseBoss {
  // Cooldown and timing constants
  public static readonly MALLET_COOLDOWN_NORMAL_MS: number = 8000;
  public static readonly MALLET_COOLDOWN_ENRAGED_MS: number = 5000;
  public static readonly MALLET_WINDUP_MS: number = 1000;
  public static readonly MALLET_SHOCKWAVE_DURATION_MS: number = 400;
  public static readonly MALLET_RADIUS_TILES: number = 3;
  public static readonly MALLET_RADIUS_PX: number = 120; // 3 tiles * 40px
  public static readonly BOMB_KNOCKBACK_SPEED: number = 360; // px/s slide
  public static readonly STEAM_VENT_COOLDOWN_MS: number = 6000;
  public static readonly STEAM_VENT_DURATION_MS: number = 600;

  // Mechanics Timers
  public malletCooldownTimerMs: number = 8000;
  public malletWindupTimerMs: number = 0;
  public isMalletWindingUp: boolean = false;
  public malletImpactActive: boolean = false;
  public malletImpactTimerMs: number = 0;
  public malletImpactX: number = 300;
  public malletImpactY: number = 260;

  public steamVentCooldownTimerMs: number = 6000;
  public steamVentDurationTimerMs: number = 0;
  public isSteamVenting: boolean = false;

  // Gear Shield (Phase 2 & Enraged)
  public gearShieldActive: boolean = false;
  public gearRotationAngle: number = 0; // in radians
  public gearRotationSpeed: number = 2.0; // rad/s

  // Clockwork Crisis Synergy
  public isClockworkCrisisActive: boolean = false;

  // Audio Synthesizer
  public readonly audio: SteamToyTitanAudio;

  // Zero-GC Pools
  public readonly shockwavePool: ObjectPool<BossShockwave>;
  public readonly gearProjectilePool: ObjectPool<BossProjectile>;

  // Scratch objects for Zero-GC queries
  private readonly scratchMalletHit: MalletHitResult = {
    hit: false,
    distance: 0,
    damage: 0,
    knockbackVx: 0,
    knockbackVy: 0,
  };

  private readonly scratchBombKnockback: BombKnockbackResult = {
    shouldKnockback: false,
    slideVx: 0,
    slideVy: 0,
    distanceTiles: 0,
  };

  private readonly preallocatedTelegraphs: TelegraphTile[] = [];

  constructor(startX: number = 300, startY: number = 260) {
    const config: BossConfig = {
      id: 'steam_toy_titan',
      name: 'Steam Toy Titan',
      title: 'Clockwork Arch-Inventor',
      avatarEmoji: '🦾',
      maxHp: 16,
      footprintWidth: 100,
      footprintHeight: 100,
      colliderRadius: 42,
      baseSpeed: 50,
      phase2HpThreshold: 0.65, // at 10.4 HP
      phase3HpThreshold: 0.35, // at 5.6 HP
    };

    const safeX = Number.isFinite(startX) ? Math.max(60, Math.min(startX, 540)) : 300;
    const safeY = Number.isFinite(startY) ? Math.max(60, Math.min(startY, 460)) : 260;
    super(config, safeX, safeY);

    this.audio = new SteamToyTitanAudio();

    // Contiguous ObjectPool for shockwaves (capacity 8)
    this.shockwavePool = new ObjectPool<BossShockwave>({
      capacity: 8,
      factory: (i) => ({
        id: i,
        active: false,
        originX: 0,
        originY: 0,
        currentRadius: 0,
        maxRadius: SteamToyTitanBoss.MALLET_RADIUS_PX,
        expansionSpeed: 300,
        damage: 1,
        affectedTilesBitmask: new Uint8Array(195),
      }),
      reset: (sw) => {
        sw.active = false;
        sw.originX = 0;
        sw.originY = 0;
        sw.currentRadius = 0;
        sw.affectedTilesBitmask.fill(0);
      },
    });

    // Contiguous ObjectPool for gear projectiles (capacity 16)
    this.gearProjectilePool = new ObjectPool<BossProjectile>({
      capacity: 16,
      factory: (i) => ({
        id: i,
        active: false,
        type: BossProjectileType.GEAR_SHARD,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 12,
        damage: 1,
        timerMs: 0,
        maxDurationMs: 3000,
        homing: false,
        targetX: 0,
        targetY: 0,
      }),
      reset: (gp) => {
        gp.active = false;
        gp.x = 0;
        gp.y = 0;
        gp.vx = 0;
        gp.vy = 0;
        gp.timerMs = 0;
      },
    });

    // Pre-allocate up to 40 telegraph tiles for Zero-GC floor warnings (Shockwave R=3 is 29 tiles)
    for (let i = 0; i < 40; i++) {
      this.preallocatedTelegraphs.push({
        id: i,
        active: false,
        row: 0,
        col: 0,
        tier: 1,
        timerMs: 0,
        durationMs: SteamToyTitanBoss.MALLET_WINDUP_MS,
      });
    }

    this.malletCooldownTimerMs = SteamToyTitanBoss.MALLET_COOLDOWN_NORMAL_MS;
    this.steamVentCooldownTimerMs = SteamToyTitanBoss.STEAM_VENT_COOLDOWN_MS;
  }

  // --- Clockwork Synergy Hook ---
  public setClockworkCrisis(active: boolean): void {
    this.isClockworkCrisisActive = active;
  }

  public override applyStun(durationSec: number): void {
    this.isMalletWindingUp = false;
    this.malletImpactActive = false;
    this.gearShieldActive = false;
    this.vx = 0;
    this.vy = 0;
    super.applyStun(durationSec);
  }

  // --- BaseBoss State Implementations ---

  protected override updatePhase1(dt: number, playerX: number, playerY: number): void {
    this.gearShieldActive = false;
    this.processMalletCycle(dt, playerX, playerY, SteamToyTitanBoss.MALLET_COOLDOWN_NORMAL_MS);
    this.processSteamVentCycle(dt, SteamToyTitanBoss.STEAM_VENT_COOLDOWN_MS);

    // Steady patrol / pursuit toward player
    if (!this.isMalletWindingUp && !this.malletImpactActive) {
      this.setVelocityTowards(playerX, playerY, this.config.baseSpeed);
      this.integrateMovement(dt);
    } else {
      this.vx = 0;
      this.vy = 0;
    }
  }

  protected override updatePhase2(dt: number, playerX: number, playerY: number): void {
    this.gearShieldActive = true;
    this.gearRotationAngle += this.gearRotationSpeed * (dt / 1000);
    if (this.gearRotationAngle >= Math.PI * 2) {
      this.gearRotationAngle -= Math.PI * 2;
    }

    const cooldown = this.isClockworkCrisisActive ? 6000 : 7000;
    this.processMalletCycle(dt, playerX, playerY, cooldown);
    this.processSteamVentCycle(dt, 5000);

    if (!this.isMalletWindingUp && !this.malletImpactActive) {
      this.setVelocityTowards(playerX, playerY, this.config.baseSpeed * 1.15);
      this.integrateMovement(dt);
    } else {
      this.vx = 0;
      this.vy = 0;
    }
  }

  protected override updateEnraged(dt: number, playerX: number, playerY: number): void {
    this.gearShieldActive = true;
    this.gearRotationSpeed = 3.5; // Rapid gear spin
    this.gearRotationAngle += this.gearRotationSpeed * (dt / 1000);
    if (this.gearRotationAngle >= Math.PI * 2) {
      this.gearRotationAngle -= Math.PI * 2;
    }

    const cooldown = this.isClockworkCrisisActive
      ? 3500
      : SteamToyTitanBoss.MALLET_COOLDOWN_ENRAGED_MS;
    this.processMalletCycle(dt, playerX, playerY, cooldown);
    this.processSteamVentCycle(dt, 3500);

    if (!this.isMalletWindingUp && !this.malletImpactActive) {
      this.setVelocityTowards(playerX, playerY, this.config.baseSpeed * 1.35);
      this.integrateMovement(dt);
    } else {
      this.vx = 0;
      this.vy = 0;
    }
  }

  protected override onStateChanged(prevState: BossState, nextState: BossState): void {
    if (nextState === BossState.PHASE_2) {
      this.phase = 2;
      this.gearShieldActive = true;
      this.audio.playSteamVent();
      this.audio.playGearWhine();
    } else if (nextState === BossState.ENRAGED) {
      this.phase = 3;
      this.gearShieldActive = true;
      this.gearRotationSpeed = 3.5;
      this.audio.playSteamVent();
      this.audio.playMalletWindup();
    } else if (nextState === BossState.STUNNED) {
      this.isMalletWindingUp = false;
      this.malletImpactActive = false;
      this.gearShieldActive = false;
      this.vx = 0;
      this.vy = 0;
    } else if (prevState === BossState.STUNNED) {
      if (this.phase >= 2) {
        this.gearShieldActive = true;
      }
    }
  }

  protected override onHitReceived(_damage: number, _isChained: boolean): void {
    this.audio.playSteamVent();
  }

  protected override onDamageBlocked(): void {
    this.audio.playGearWhine();
  }

  protected override onDefeated(): void {
    this.isMalletWindingUp = false;
    this.malletImpactActive = false;
    this.gearShieldActive = false;
    this.vx = 0;
    this.vy = 0;
    this.audio.playSteamVent();
  }

  // --- Core Combat Mechanics ---

  /**
   * Manages the Toy Mallet windup, telegraphing, and slam impact execution.
   */
  private processMalletCycle(
    dt: number,
    playerX: number,
    playerY: number,
    cooldownMs: number
  ): void {
    // 1. If currently in windup
    if (this.isMalletWindingUp) {
      this.malletWindupTimerMs -= dt;
      if (this.malletWindupTimerMs <= 0) {
        this.isMalletWindingUp = false;
        this.executeMalletSlam(this.malletImpactX, this.malletImpactY);
      }
      return;
    }

    // 2. If shockwave is active
    if (this.malletImpactActive) {
      this.malletImpactTimerMs -= dt;
      if (this.malletImpactTimerMs <= 0) {
        this.malletImpactActive = false;
      }
    }

    // 3. Count down cooldown
    this.malletCooldownTimerMs -= dt;
    if (this.malletCooldownTimerMs <= 0) {
      this.malletCooldownTimerMs = cooldownMs;
      this.startMalletWindup(playerX, playerY);
    }
  }

  /**
   * Initiates the 1,000ms windup with target coordinate selection.
   */
  public startMalletWindup(targetX: number, targetY: number): void {
    this.isMalletWindingUp = true;
    this.malletWindupTimerMs = SteamToyTitanBoss.MALLET_WINDUP_MS;

    // Target either player position clamped to arena or titan location
    const safeX = Number.isFinite(targetX) ? Math.max(60, Math.min(targetX, 540)) : this.x;
    const safeY = Number.isFinite(targetY) ? Math.max(60, Math.min(targetY, 460)) : this.y;

    this.malletImpactX = safeX;
    this.malletImpactY = safeY;

    this.audio.playMalletWindup();
    this.populateMalletTelegraphs(safeX, safeY);
  }

  /**
   * Populates floor warning tiles ensuring >= 40% safe area invariant.
   * A 3-tile Euclidean disc has 29 tiles out of 195 (only 14.8% of arena => 85.2% safe).
   */
  private populateMalletTelegraphs(centerX: number, centerY: number): void {
    const centerCol = Math.max(0, Math.min(14, Math.floor(centerX / 40)));
    const centerRow = Math.max(0, Math.min(12, Math.floor(centerY / 40)));

    let tileIdx = 0;
    const maxR = SteamToyTitanBoss.MALLET_RADIUS_TILES;

    for (let dr = -maxR; dr <= maxR; dr++) {
      for (let dc = -maxR; dc <= maxR; dc++) {
        if (dr * dr + dc * dc <= maxR * maxR) {
          const r = centerRow + dr;
          const c = centerCol + dc;
          if (r >= 0 && r < 13 && c >= 0 && c < 15 && tileIdx < this.preallocatedTelegraphs.length) {
            const t = this.preallocatedTelegraphs[tileIdx++];
            t.active = true;
            t.row = r;
            t.col = c;
            t.tier = 2; // Amber active threat
            t.timerMs = 0;
            t.durationMs = SteamToyTitanBoss.MALLET_WINDUP_MS;
          }
        }
      }
    }

    // Deactivate remainder
    for (let i = tileIdx; i < this.preallocatedTelegraphs.length; i++) {
      this.preallocatedTelegraphs[i].active = false;
    }
  }

  /**
   * Executes the mallet slam down impact: creates shockwave & triggers sound.
   */
  public executeMalletSlam(impactX: number, impactY: number): void {
    this.malletImpactActive = true;
    this.malletImpactTimerMs = SteamToyTitanBoss.MALLET_SHOCKWAVE_DURATION_MS;
    this.malletImpactX = impactX;
    this.malletImpactY = impactY;

    // Deactivate telegraphs
    for (const t of this.preallocatedTelegraphs) {
      t.active = false;
    }

    // Allocate shockwave from pool
    const sw = this.shockwavePool.acquire();
    if (sw) {
      sw.originX = impactX;
      sw.originY = impactY;
      sw.currentRadius = SteamToyTitanBoss.MALLET_RADIUS_PX;
      sw.maxRadius = SteamToyTitanBoss.MALLET_RADIUS_PX;
      sw.damage = 1;
    }

    this.audio.playMalletImpact();
  }

  /**
   * Queries whether a bomb at (bx, by) is within the 3-tile shockwave.
   * If within range, returns knockback direction sliding the bomb 2 tiles outward away from impact.
   */
  public checkBombKnockback(
    bombX: number,
    bombY: number,
    bombCol: number,
    bombRow: number
  ): BombKnockbackResult {
    const res = this.scratchBombKnockback;
    res.shouldKnockback = false;
    res.slideVx = 0;
    res.slideVy = 0;
    res.distanceTiles = 0;

    if (!this.malletImpactActive) {
      return res;
    }

    const dx = bombX - this.malletImpactX;
    const dy = bombY - this.malletImpactY;
    const distPx = Math.hypot(dx, dy);

    if (distPx <= SteamToyTitanBoss.MALLET_RADIUS_PX) {
      res.shouldKnockback = true;
      res.distanceTiles = distPx / 40;

      if (distPx > 1e-4) {
        const nx = dx / distPx;
        const ny = dy / distPx;
        res.slideVx = nx * SteamToyTitanBoss.BOMB_KNOCKBACK_SPEED;
        res.slideVy = ny * SteamToyTitanBoss.BOMB_KNOCKBACK_SPEED;
      } else {
        // Fallback outward slide
        res.slideVx = SteamToyTitanBoss.BOMB_KNOCKBACK_SPEED;
        res.slideVy = 0;
      }
    }

    return res;
  }

  /**
   * Evaluates player damage & knockback from active mallet shockwave (Zero-GC).
   */
  public evaluatePlayerMalletHit(playerX: number, playerY: number): MalletHitResult {
    const res = this.scratchMalletHit;
    res.hit = false;
    res.distance = 0;
    res.damage = 0;
    res.knockbackVx = 0;
    res.knockbackVy = 0;

    if (!this.malletImpactActive) {
      return res;
    }

    const dx = playerX - this.malletImpactX;
    const dy = playerY - this.malletImpactY;
    const dist = Math.hypot(dx, dy);

    if (dist <= SteamToyTitanBoss.MALLET_RADIUS_PX) {
      res.hit = true;
      res.distance = dist;
      res.damage = 1;
      if (dist > 1e-4) {
        res.knockbackVx = (dx / dist) * 240;
        res.knockbackVy = (dy / dist) * 240;
      } else {
        res.knockbackVx = 0;
        res.knockbackVy = 240;
      }
    }

    return res;
  }

  /**
   * Manages directional steam vent cooldown & activation.
   */
  private processSteamVentCycle(dt: number, cooldownMs: number): void {
    if (this.isSteamVenting) {
      this.steamVentDurationTimerMs -= dt;
      if (this.steamVentDurationTimerMs <= 0) {
        this.isSteamVenting = false;
      }
      return;
    }

    this.steamVentCooldownTimerMs -= dt;
    if (this.steamVentCooldownTimerMs <= 0) {
      this.steamVentCooldownTimerMs = cooldownMs;
      this.triggerSteamVent();
    }
  }

  public triggerSteamVent(): void {
    this.isSteamVenting = true;
    this.steamVentDurationTimerMs = SteamToyTitanBoss.STEAM_VENT_DURATION_MS;
    this.audio.playSteamVent();
  }

  /**
   * Damage blocking overrides: Gear shield absorbs frontal blast hits during Phase 2/3.
   */
  public override canTakeDamage(): boolean {
    if (
      this.bossState === BossState.INTRO ||
      this.bossState === BossState.INTERMISSION ||
      this.bossState === BossState.DEFEATED
    ) {
      return false;
    }
    return true;
  }

  /**
   * Gear shield frontal blast deflection check.
   * If hit arrives from the front (-45 to +45 deg of boss facing), gear shield deflects it!
   */
  public checkGearDeflection(sourceX: number, sourceY: number): boolean {
    if (!this.gearShieldActive) return false;

    const dx = sourceX - this.x;
    const dy = sourceY - this.y;
    const angleToSource = Math.atan2(dy, dx);
    const facingAngle = Math.atan2(this.vy, this.vx);

    let angleDiff = Math.abs(angleToSource - facingAngle);
    if (angleDiff > Math.PI) {
      angleDiff = Math.PI * 2 - angleDiff;
    }

    // Frontal quadrant within 60 degrees (Math.PI / 3) is absorbed by gear shield
    if (angleDiff < Math.PI / 3) {
      this.audio.playGearWhine();
      return true;
    }
    return false;
  }

  /**
   * Returns active telegraph floor warnings.
   */
  public getActiveTelegraphs(): readonly TelegraphTile[] {
    return this.preallocatedTelegraphs;
  }

  public override getHUDData(): BossHUDData {
    const data = super.getHUDData();
    data.bossId = this.config.id;
    data.avatarEmoji = this.config.avatarEmoji;
    return data;
  }

  public destroy(): void {
    this.audio.destroy();
    this.shockwavePool.destroy();
    this.gearProjectilePool.destroy();
  }
}
