import Phaser from 'phaser';
import { type EntityFaction, FACTIONS } from './types.ts';
import { OverheadUI } from './OverheadUI.ts';
import { clamp, clampSpeed, clampVelocity, normalizeVector } from './SpatialSeparation.ts';
export { clamp, clampSpeed, clampVelocity, normalizeVector };

/**
 * Physics Body Invariant Guard:
 * Freezes the Arcade physics body dimensions and position relative to the sprite transform,
 * guaranteeing that scale changes (squash/stretch) and displayOriginY modulations (visual bobbing)
 * never alter the physical collision box or cause corner snagging.
 */
interface MutableArcadeBody extends Phaser.Physics.Arcade.Body {
  width: number;
  height: number;
  halfWidth: number;
  halfHeight: number;
  transform: { x: number; y: number; rotation?: number; scaleX?: number; scaleY?: number };
}

interface ISceneShadowPool {
  shadowPool?: { release: (sprite: Phaser.GameObjects.Sprite) => void };
  circlePool?: {
    acquire: () => Phaser.GameObjects.Arc | null;
    release: (arc: Phaser.GameObjects.Arc) => void;
  };
}

export function applyPhysicsBodyInvariantGuard(
  sprite: Phaser.Physics.Arcade.Sprite,
  targetWidth: number = 24,
  targetHeight: number = 24,
  offsetX: number = 8,
  offsetY: number = 8
): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body | undefined;
  if (!body) return;
  if (typeof body.setSize === 'function') {
    body.setSize(targetWidth, targetHeight);
  }
  if (typeof body.setOffset === 'function') {
    body.setOffset(offsetX, offsetY);
  }
  const fixedHalfW = targetWidth / 2;
  const fixedHalfH = targetHeight / 2;
  const fixedRelX = offsetX - 20;
  const fixedRelY = offsetY - 20;

  const mutableBody = body as unknown as MutableArcadeBody;
  mutableBody.updateBounds = function(this: MutableArcadeBody) {
    const sx = Number.isFinite(sprite.x) ? sprite.x : 0;
    const sy = Number.isFinite(sprite.y) ? sprite.y : 0;
    if (this.transform) {
      this.transform.x = sx;
      this.transform.y = sy;
      this.transform.rotation = sprite.rotation ?? 0;
      this.transform.scaleX = sprite.scaleX ?? 1;
      this.transform.scaleY = sprite.scaleY ?? 1;
    }
    this.width = targetWidth;
    this.height = targetHeight;
    this.halfWidth = fixedHalfW;
    this.halfHeight = fixedHalfH;
    if (typeof this.updateCenter === 'function') {
      this.updateCenter();
    }
  };
  mutableBody.updateFromGameObject = function(this: MutableArcadeBody) {
    if (!Number.isFinite(sprite.x)) sprite.x = 0;
    if (!Number.isFinite(sprite.y)) sprite.y = 0;
    this.updateBounds();
    this.position.x = sprite.x + fixedRelX;
    this.position.y = sprite.y + fixedRelY;
    if (typeof this.updateCenter === 'function') {
      this.updateCenter();
    }
  };
}

/**
 * BaseEntity: Abstract Foundation for all dynamic entities (Enemies, Neutrals, Allies).
 * Manages Sprite physics, HP pool, i-frames, stun, faction alignment, and 3-Tier Overhead UI.
 */
export abstract class BaseEntity extends Phaser.Physics.Arcade.Sprite {
  private static _nextEntityUid: number = 1;
  public readonly entityId: string;
  public hp: number;
  public maxHp: number;
  public readonly baseMaxHp: number;
  public faction: EntityFaction;
  public entityType: string;
  public entityName: string;
  public normalizedEntityType: string = '';
  public overheadUI: OverheadUI;
  protected readonly overheadBarWidth: number;
  protected readonly overheadHpBarColor?: number;

  public invulnerableTimer: number = 0;
  public iFrameDurationMs: number = 800;
  public isStunned: boolean = false;
  public stunUntil: number = 0;
  public speedMultiplier: number = 1.0;
  public speedMultiplierUntilMs: number = 0;
  public tauntTarget: BaseEntity | null = null;
  public tauntedUntil: number = 0;
  public bossOwnerRef: { onMinionDefeated: () => void } | null = null;
  public isDead: boolean = false;
  public moveSpeed: number = 70;
  public collisionRadius: number = 12;
  public mass: number = 1.0;
  public isPhasing: boolean = false;

  // Juice & Animation parameters
  public stepCycle: number = 0;
  public bobOffset: number = 0;
  public baseDisplayOriginY: number = 20;
  public baseScaleX: number = 1.0;
  public baseScaleY: number = 1.0;
  private _isSquashStretching: boolean = false;
  protected _isMovingAnimation: boolean = false;
  protected _lastEntityTimeMs: number = -1;
  public dropShadow?: Phaser.GameObjects.Sprite;
  public dropShadowScale: number = 1.0;

  protected getEntityClockNow(): number {
    if (this._lastEntityTimeMs >= 0 && Number.isFinite(this._lastEntityTimeMs)) {
      return this._lastEntityTimeMs;
    }
    const sceneNow = this.scene?.time?.now;
    return typeof sceneNow === 'number' && Number.isFinite(sceneNow) ? sceneNow : 0;
  }

  public override setVelocity(x?: number, y?: number): this {
    if (this.isStunned) {
      return super.setVelocity(0, 0);
    }
    const mult = (this.speedMultiplierUntilMs > 0 && this.speedMultiplier > 0) ? this.speedMultiplier : 1.0;
    const sx = (x ?? 0) * mult;
    const sy = (y ?? 0) * mult;
    return super.setVelocity(sx, sy);
  }

  public applyStun(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs <= 0 || this.isDead) return;
    this.isStunned = true;
    const now = this.getEntityClockNow();
    this.stunUntil = Math.max(this.stunUntil, now + durationMs);
    super.setVelocity(0, 0);
    if (this.overheadUI) {
      this.overheadUI.setIntent('💫', true);
    }
  }

  public applySpeedMultiplier(multiplier: number, durationMs: number): void {
    if (!Number.isFinite(multiplier) || multiplier <= 0 || !Number.isFinite(durationMs) || durationMs <= 0 || this.isDead) return;
    this.speedMultiplier = Math.min(this.speedMultiplier, multiplier);
    const now = this.getEntityClockNow();
    this.speedMultiplierUntilMs = Math.max(this.speedMultiplierUntilMs, now + durationMs);
  }

  public override setScale(x?: number, y?: number): this {
    super.setScale(x, y);
    if (!this._isSquashStretching && x !== undefined) {
      this.baseScaleX = x;
      this.baseScaleY = y !== undefined ? y : x;
    }
    return this;
  }

  public setBaseScale(x: number, y: number = x): this {
    this.baseScaleX = x;
    this.baseScaleY = y;
    return super.setScale(x, y);
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    faction: EntityFaction,
    maxHp: number,
    entityName: string,
    entityType: string,
    barWidth: number = 24,
    hpBarColor?: number
  ) {
    super(scene, x, y, texture);
    this.entityId = `ent_${BaseEntity._nextEntityUid++}`;
    this.faction = faction;
    this.maxHp = Math.max(1, maxHp);
    this.baseMaxHp = this.maxHp;
    this.hp = this.maxHp;
    this.entityName = entityName;
    this.entityType = entityType;
    this.normalizedEntityType = (entityType || '').toLowerCase();

    if (scene && scene.add) {
      scene.add.existing(this);
    }
    if (scene && scene.physics && scene.physics.add) {
      scene.physics.add.existing(this);
    }

    if (this.body && typeof (this.body as unknown as { setCollideWorldBounds?: unknown }).setCollideWorldBounds === 'function') {
      this.setCollideWorldBounds(true);
    }
    this.setDepth(9);
    applyPhysicsBodyInvariantGuard(this, 24, 24, 8, 8);

    this.overheadBarWidth = barWidth;
    this.overheadHpBarColor = hpBarColor;
    this.overheadUI = new OverheadUI(scene, entityName, faction, maxHp, barWidth, hpBarColor);
  }

  /**
   * Revives an inactive pooled BaseEntity at `(x, y)` in both real Phaser Arcade Worlds
   * and lightweight headless physics mocks, then resets all entity state via `reset()`.
   */
  public reviveAt(x: number, y: number): this {
    const bodyRef = this.body as (Phaser.Physics.Arcade.Body & {
      gameObject?: unknown;
      reset?: (rx: number, ry: number) => void;
    }) | undefined;
    if (
      bodyRef &&
      bodyRef.gameObject &&
      typeof bodyRef.reset === 'function' &&
      typeof this.enableBody === 'function'
    ) {
      this.enableBody(true, x, y, true, true);
    } else {
      if (bodyRef) {
        if (typeof bodyRef.reset === 'function') {
          bodyRef.reset(x, y);
        }
        bodyRef.enable = true;
      }
      this.setPosition(x, y);
      this.setActive(true);
      this.setVisible(true);
    }
    this.reset();
    return this;
  }

  /**
   * Resets a pooled/inactive BaseEntity back to clean live defaults without leaking
   * stale death, stun, speed-debuff, velocity, or destroyed OverheadUI state.
   */
  public reset(): void {
    const sceneTweens = (
      this.scene as unknown as { tweens?: { killTweensOf?: (target: unknown) => void } } | undefined
    )?.tweens;
    if (sceneTweens && typeof sceneTweens.killTweensOf === 'function') {
      sceneTweens.killTweensOf(this);
    }

    this.isDead = false;
    this.maxHp = this.baseMaxHp;
    this.hp = this.maxHp;
    this.invulnerableTimer = 0;
    this.isStunned = false;
    this.stunUntil = 0;
    this.speedMultiplier = 1.0;
    this.speedMultiplierUntilMs = 0;
    this.tauntTarget = null;
    this.tauntedUntil = 0;
    this.bossOwnerRef = null;
    this.stepCycle = 0;
    this.bobOffset = 0;
    this._isSquashStretching = false;
    this._isMovingAnimation = false;
    this._lastEntityTimeMs = -1;
    this.displayOriginY = this.baseDisplayOriginY;

    this.setAngle(0);
    this.setAlpha(1.0);
    this.setScale(this.baseScaleX, this.baseScaleY);
    if (typeof this.clearTint === 'function') {
      this.clearTint();
    }
    super.setVelocity(0, 0);

    if (!this.overheadUI) {
      this.overheadUI = new OverheadUI(
        this.scene,
        this.entityName,
        this.faction,
        this.maxHp,
        this.overheadBarWidth,
        this.overheadHpBarColor
      );
    } else {
      this.overheadUI.scene = this.scene;
      this.overheadUI.revive(this.maxHp, this.faction);
      this.overheadUI.update(this.x, this.y, this.hp);
    }
  }

  /**
   * Applies damage with strict friendly-fire immunity and i-frame invulnerability guards.
   * Returns true if the entity died from this damage tick.
   */
  public takeDamage(amount: number, sourceBombOwner?: string, currentTime: number = 0): boolean {
    if (this.isDead || !this.active || this.invulnerableTimer > 0) {
      return false;
    }

    // Friendly-fire invariant:
    // 1. Allies take ZERO damage from player or fellow ally bombs
    if (
      this.faction === FACTIONS.ALLY &&
      (sourceBombOwner === 'player' || sourceBombOwner === 'ally')
    ) {
      return false;
    }

    // 2. Enemies take ZERO damage from fellow enemy bombs
    if (this.faction === FACTIONS.ENEMY && sourceBombOwner === 'enemy') {
      return false;
    }

    this.hp = Math.max(0, this.hp - amount);
    this.invulnerableTimer = Math.max(this.invulnerableTimer || 0, this.iFrameDurationMs);

    // Sprite flashing tween during i-frames
    if (this.scene && this.scene.tweens && this.active) {
      this.scene.tweens.add({
        targets: this,
        alpha: 0.3,
        yoyo: true,
        repeat: 3,
        duration: 100,
        onComplete: () => {
          if (this.active && !this.isDead) {
            this.setAlpha(1.0);
          }
        },
      });
    }

    // Update HP bar
    this.overheadUI.update(this.x, this.y, this.hp);

    if (this.hp <= 0) {
      const s = this.scene as unknown as {
        triggerHitStop?: (durationMs: number) => void;
        cameraTrauma?: { addTrauma: (amount: number) => void };
      };
      if (s?.triggerHitStop) {
        s.triggerHitStop(45);
      }
      if (s?.cameraTrauma) {
        s.cameraTrauma.addTrauma(0.30);
      }
      this.die(currentTime);
      return true;
    }

    return false;
  }

  /**
   * Entity death lifecycle: triggers onDeath hook, cleans up UI, and destroys sprite.
   */
  public die(currentTime: number = 0): void {
    if (this.isDead) return;
    this.isDead = true;

    if (this.dropShadow) {
      const sceneWithPool = this.scene as unknown as ISceneShadowPool | undefined;
      if (sceneWithPool?.shadowPool) {
        sceneWithPool.shadowPool.release(this.dropShadow);
      } else {
        this.dropShadow.destroy();
      }
      this.dropShadow = undefined;
    }

    // Trigger archetype-specific on-death behavior (splits, loot drops, score)
    this.onDeath(currentTime);
    if (this.bossOwnerRef) {
      const owner = this.bossOwnerRef;
      this.bossOwnerRef = null;
      owner.onMinionDefeated();
    }
    this.tauntTarget = null;
    this.tauntedUntil = 0;

    if (this.overheadUI) {
      this.overheadUI.destroy();
    }

    // Death explosion particles (Zero-GC pooled via scene.circlePool when available)
    if (this.scene && this.active) {
      const sceneWithPool = this.scene as unknown as ISceneShadowPool | undefined;
      const circlePool = sceneWithPool?.circlePool;
      const deathX = this.x;
      const deathY = this.y;
      const sparkScene = this.scene;
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        if (circlePool) {
          const spark = circlePool.acquire();
          if (!spark) continue;
          if (typeof spark.setStrokeStyle === 'function') {
            spark.setStrokeStyle(0, 0, 0);
          }
          spark
            .setActive(true)
            .setVisible(true)
            .setPosition(deathX, deathY)
            .setRadius(4)
            .setFillStyle(0xffe066, 0.9)
            .setAlpha(0.9)
            .setScale(1);
          spark.setDepth(14);
          let sparkReleased = false;
          const releaseSpark = () => {
            if (!sparkReleased && sceneWithPool?.circlePool === circlePool) {
              sparkReleased = true;
              circlePool.release(spark);
            }
          };
          sparkScene.tweens.add({
            targets: spark,
            x: deathX + Math.cos(angle) * 22,
            y: deathY + Math.sin(angle) * 22,
            alpha: 0,
            scale: 0.2,
            duration: 260,
            onComplete: releaseSpark,
            onStop: releaseSpark,
          });
        } else {
          const spark = sparkScene.add.circle(deathX, deathY, 4, 0xffe066, 0.9);
          spark.setDepth(14);
          let sparkDestroyed = false;
          const destroySpark = () => {
            if (!sparkDestroyed) {
              sparkDestroyed = true;
              spark.destroy();
            }
          };
          sparkScene.tweens.add({
            targets: spark,
            x: deathX + Math.cos(angle) * 22,
            y: deathY + Math.sin(angle) * 22,
            alpha: 0,
            scale: 0.2,
            duration: 260,
            onComplete: destroySpark,
            onStop: destroySpark,
          });
        }
      }
    }

    const sceneTweens = (
      this.scene as unknown as { tweens?: { killTweensOf?: (target: unknown) => void } } | undefined
    )?.tweens;
    if (sceneTweens && typeof sceneTweens.killTweensOf === 'function') {
      sceneTweens.killTweensOf(this);
    }

    const bodyRef = this.body as
      | (Phaser.Physics.Arcade.Body & { gameObject?: unknown; stop?: () => void })
      | undefined;
    if (bodyRef) {
      if (bodyRef.gameObject && typeof bodyRef.stop === 'function' && typeof this.disableBody === 'function') {
        this.disableBody(true, true);
      } else {
        if (typeof bodyRef.setVelocity === 'function') {
          bodyRef.setVelocity(0, 0);
        } else if (bodyRef.velocity) {
          bodyRef.velocity.x = 0;
          bodyRef.velocity.y = 0;
        }
        bodyRef.enable = false;
        this.setActive(false);
        this.setVisible(false);
      }
    } else {
      this.setActive(false);
      this.setVisible(false);
    }
  }

  protected onDeath(_currentTime?: number): void {
    void _currentTime;
    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    if (body) {
      body.setVelocity(0, 0);
    }
    if (this.overheadUI) {
      this.overheadUI.setVisible(false);
    }
  }

  /**
   * Clamps current physics body velocity within [minSpeed, maxSpeed] (default: 50 to 400 px/s).
   * Guards against NaN, -Infinity, and extreme impulses.
   */
  public clampBodyVelocity(minSpeed: number = 50, maxSpeed: number = 400): void {
    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body || !body.velocity) return;
    const clamped = clampVelocity(body.velocity.x, body.velocity.y, minSpeed, maxSpeed);
    body.velocity.x = clamped.vx;
    body.velocity.y = clamped.vy;
  }

  /**
   * Per-frame update for timers, stun status, and Overhead UI positioning.
   */
  public updateEntity(delta: number, currentTime: number = 0): void {
    if (this.isDead || !this.active) return;
    if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
      this._lastEntityTimeMs = currentTime;
    }

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - delta);
    }

    if (this.isStunned && currentTime >= this.stunUntil) {
      this.isStunned = false;
      this.overheadUI.setIntent('', false);
    }

    if (this.speedMultiplierUntilMs > 0 && currentTime >= this.speedMultiplierUntilMs) {
      this.speedMultiplier = 1.0;
      this.speedMultiplierUntilMs = 0;
    }

    if (
      this.tauntTarget &&
      (currentTime >= this.tauntedUntil || !this.tauntTarget.active || this.tauntTarget.isDead)
    ) {
      this.tauntTarget = null;
      this.tauntedUntil = 0;
    }

    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    if (body?.velocity) {
      if (!Number.isFinite(body.velocity.x) || !Number.isFinite(body.velocity.y)) {
        body.velocity.x = 0;
        body.velocity.y = 0;
      } else {
        const safeVx = Math.abs(body.velocity.x) < 1e-15 ? 0 : body.velocity.x;
        const safeVy = Math.abs(body.velocity.y) < 1e-15 ? 0 : body.velocity.y;
        const speed = Math.hypot(safeVx, safeVy);
        if (speed < 1e-8) {
          body.velocity.x = 0;
          body.velocity.y = 0;
        } else if (speed > 400) {
          const scale = 400 / speed;
          const nVx = safeVx * scale;
          const nVy = safeVy * scale;
          body.velocity.x = Math.abs(nVx) < 1e-15 ? 0 : nVx;
          body.velocity.y = Math.abs(nVy) < 1e-15 ? 0 : nVy;
        } else {
          body.velocity.x = safeVx;
          body.velocity.y = safeVy;
        }
      }
    }
    const vx = body ? body.velocity.x : 0;
    const vy = body ? body.velocity.y : 0;
    const currentSpeed = Math.hypot(vx, vy);
    if (this._isMovingAnimation) {
      if (currentSpeed < 1.2) {
        this._isMovingAnimation = false;
      }
    } else {
      if (currentSpeed > 2.5) {
        this._isMovingAnimation = true;
      }
    }
    const isMoving = this._isMovingAnimation;

    const typeLower = this.normalizedEntityType;
    if (typeLower === 'ghost') {
      // Ghost float hover: smooth sine wave
      const hover = Math.sin(currentTime * 0.003) * 4;
      this.bobOffset = hover;
      this.displayOriginY = this.baseDisplayOriginY - hover;
      this.setAlpha(0.7 + Math.abs(Math.sin(currentTime * 0.002)) * 0.25);
    } else if (isMoving && !this.isStunned) {
      const speedMag = Math.hypot(vx, vy);
      this.stepCycle += (delta / 1000) * (speedMag / 25);
      // 0 to 3px vertical hop
      const hop = Math.abs(Math.sin(this.stepCycle * Math.PI)) * 3;
      this.bobOffset = hop;
      this.displayOriginY = this.baseDisplayOriginY - hop;

      // Squash and stretch: respect baseScaleX and baseScaleY
      if (typeLower === 'tank') {
        const stompNorm = hop / 3;
        const factorX = 1.0 + 0.15 * (1 - stompNorm);
        const factorY = 1.0 - 0.15 * (1 - stompNorm);
        this._isSquashStretching = true;
        this.setScale(this.baseScaleX * factorX, this.baseScaleY * factorY);
        this._isSquashStretching = false;
        this.setAngle(vx !== 0 ? Math.sign(vx) * 2.0 : 0);
      } else {
        const apexNorm = hop / 3;
        const factorX = 1.08 - 0.14 * apexNorm;
        const factorY = 0.92 + 0.14 * apexNorm;
        this._isSquashStretching = true;
        this.setScale(this.baseScaleX * factorX, this.baseScaleY * factorY);
        this._isSquashStretching = false;
        this.setAngle(vx !== 0 ? Math.sign(vx) * 3.5 : 0);
      }

      // Walking dust emitter
      const sceneWithDust = this.scene as unknown as { dustEmitter?: { emitParticleAt: (x: number, y: number, count?: number) => void } };
      if (sceneWithDust?.dustEmitter && Math.random() < 0.08) {
        sceneWithDust.dustEmitter.emitParticleAt(this.x, this.y + 14, 1);
      }
    } else {
      this.bobOffset = 0;
      this.displayOriginY = this.baseDisplayOriginY;
      this.setAngle(0);
      if (!this.isStunned) {
        const breathe = Math.sin(currentTime * 0.003) * 0.02;
        this._isSquashStretching = true;
        this.setScale(this.baseScaleX * (1.0 - breathe), this.baseScaleY * (1.0 + breathe));
        this._isSquashStretching = false;
      } else {
        this._isSquashStretching = true;
        this.setScale(this.baseScaleX, this.baseScaleY);
        this._isSquashStretching = false;
      }
    }

    // Dynamic drop shadow update under entity (depth 6)
    if (this.dropShadow && this.dropShadow.active) {
      this.dropShadow.x = this.x;
      this.dropShadow.y = this.y + 14;
      const hNorm = Math.max(0, this.bobOffset) / 20;
      const s = this.dropShadowScale > 0 ? this.dropShadowScale : 1.0;
      this.dropShadow.setScale(
        Math.max(0.4, 1.0 - hNorm * 0.25) * s,
        Math.max(0.3, 0.7 - hNorm * 0.2) * s
      );
      this.dropShadow.setAlpha(Math.max(0.15, 0.45 - hNorm * 0.20));
      this.dropShadow.setDepth(6);
    }

    this.overheadUI.update(this.x, this.y, this.hp);
  }

  public override destroy(fromScene?: boolean): void {
    const sceneTweens = (
      this.scene as unknown as { tweens?: { killTweensOf?: (target: unknown) => void } } | undefined
    )?.tweens;
    if (sceneTweens && typeof sceneTweens.killTweensOf === 'function') {
      sceneTweens.killTweensOf(this);
    }
    if (this.dropShadow) {
      const sceneWithPool = this.scene as unknown as ISceneShadowPool | undefined;
      if (sceneWithPool?.shadowPool) {
        sceneWithPool.shadowPool.release(this.dropShadow);
      } else {
        this.dropShadow.destroy();
      }
      this.dropShadow = undefined;
    }
    if (this.overheadUI) {
      this.overheadUI.destroy();
    }
    super.destroy(fromScene);
  }
}
