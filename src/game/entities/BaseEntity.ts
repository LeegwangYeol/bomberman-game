import Phaser from 'phaser';
import { type EntityFaction, FACTIONS } from './types';
import { OverheadUI } from './OverheadUI';

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
  transform: { x: number; y: number };
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
  body.setSize(targetWidth, targetHeight).setOffset(offsetX, offsetY);
  const fixedHalfW = targetWidth / 2;
  const fixedHalfH = targetHeight / 2;
  const fixedRelX = offsetX - 20;
  const fixedRelY = offsetY - 20;

  const mutableBody = body as unknown as MutableArcadeBody;
  mutableBody.updateBounds = function(this: MutableArcadeBody) {
    this.width = targetWidth;
    this.height = targetHeight;
    this.halfWidth = fixedHalfW;
    this.halfHeight = fixedHalfH;
    this.updateCenter();
  };
  mutableBody.updateFromGameObject = function(this: MutableArcadeBody) {
    this.updateBounds();
    this.position.x = this.transform.x + fixedRelX;
    this.position.y = this.transform.y + fixedRelY;
    this.updateCenter();
  };
}

/**
 * BaseEntity: Abstract Foundation for all dynamic entities (Enemies, Neutrals, Allies).
 * Manages Sprite physics, HP pool, i-frames, stun, faction alignment, and 3-Tier Overhead UI.
 */
export abstract class BaseEntity extends Phaser.Physics.Arcade.Sprite {
  public hp: number;
  public maxHp: number;
  public faction: EntityFaction;
  public entityType: string;
  public entityName: string;
  public overheadUI: OverheadUI;

  public invulnerableTimer: number = 0;
  public iFrameDurationMs: number = 800;
  public isStunned: boolean = false;
  public stunUntil: number = 0;
  public isDead: boolean = false;
  public moveSpeed: number = 70;

  // Juice & Animation parameters
  public stepCycle: number = 0;
  public bobOffset: number = 0;
  public baseDisplayOriginY: number = 20;
  public dropShadow?: Phaser.GameObjects.Sprite;

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
    this.faction = faction;
    this.maxHp = Math.max(1, maxHp);
    this.hp = this.maxHp;
    this.entityName = entityName;
    this.entityType = entityType;

    if (scene && scene.add) {
      scene.add.existing(this);
    }
    if (scene && scene.physics && scene.physics.add) {
      scene.physics.add.existing(this);
    }

    this.setCollideWorldBounds(true);
    this.setDepth(9);
    applyPhysicsBodyInvariantGuard(this, 24, 24, 8, 8);

    this.overheadUI = new OverheadUI(scene, entityName, faction, maxHp, barWidth, hpBarColor);
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
    this.invulnerableTimer = this.iFrameDurationMs;

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
      this.dropShadow.destroy();
      this.dropShadow = undefined;
    }

    // Trigger archetype-specific on-death behavior (splits, loot drops, score)
    this.onDeath(currentTime);

    if (this.overheadUI) {
      this.overheadUI.destroy();
    }

    // Death explosion particles
    if (this.scene && this.active) {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const spark = this.scene.add.circle(this.x, this.y, 4, 0xffe066, 0.9);
        spark.setDepth(14);
        this.scene.tweens.add({
          targets: spark,
          x: this.x + Math.cos(angle) * 22,
          y: this.y + Math.sin(angle) * 22,
          alpha: 0,
          scale: 0.2,
          duration: 260,
          onComplete: () => spark.destroy(),
        });
      }
    }

    this.destroy();
  }

  /**
   * Protected hook for archetype-specific death effects (e.g., Splitter division, Merchant loot).
   */
  protected onDeath(_currentTime?: number): void {
    void _currentTime;
  }

  /**
   * Per-frame update for timers, stun status, and Overhead UI positioning.
   */
  public updateEntity(delta: number, currentTime: number = 0): void {
    if (this.isDead || !this.active) return;

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - delta);
    }

    if (this.isStunned && currentTime >= this.stunUntil) {
      this.isStunned = false;
      this.overheadUI.setIntent('', false);
    }

    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    const vx = body ? body.velocity.x : 0;
    const vy = body ? body.velocity.y : 0;
    const isMoving = Math.abs(vx) > 1 || Math.abs(vy) > 1;

    if (this.entityType === 'ghost') {
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

      // Squash and stretch: 1.08/0.92 at ground, 0.94/1.06 at apex
      if (this.entityType === 'tank') {
        const stompNorm = hop / 3;
        this.setScale(1.0 + 0.15 * (1 - stompNorm), 1.0 - 0.15 * (1 - stompNorm));
        this.setAngle(vx !== 0 ? Math.sign(vx) * 2.0 : 0);
      } else {
        const apexNorm = hop / 3;
        const scaleX = 1.08 - 0.14 * apexNorm;
        const scaleY = 0.92 + 0.14 * apexNorm;
        this.setScale(scaleX, scaleY);
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
        this.setScale(1.0 - breathe, 1.0 + breathe);
      }
    }

    // Dynamic drop shadow update under entity (depth 6)
    if (this.dropShadow && this.dropShadow.active) {
      this.dropShadow.x = this.x;
      this.dropShadow.y = this.y + 14;
      const hNorm = Math.max(0, this.bobOffset) / 20;
      this.dropShadow.setScale(Math.max(0.4, 1.0 - hNorm * 0.25), Math.max(0.3, 0.7 - hNorm * 0.2));
      this.dropShadow.setAlpha(Math.max(0.15, 0.45 - hNorm * 0.20));
      this.dropShadow.setDepth(6);
    }

    this.overheadUI.update(this.x, this.y, this.hp);
  }

  public override destroy(fromScene?: boolean): void {
    if (this.dropShadow) {
      this.dropShadow.destroy();
      this.dropShadow = undefined;
    }
    if (this.overheadUI) {
      this.overheadUI.destroy();
    }
    super.destroy(fromScene);
  }
}
