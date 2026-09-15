import Phaser from 'phaser';
import { EntityFaction, FACTIONS } from './types';
import { OverheadUI } from './OverheadUI';

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
    (this.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(8, 8);

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

    this.overheadUI.update(this.x, this.y, this.hp);
  }

  public override destroy(fromScene?: boolean): void {
    if (this.overheadUI) {
      this.overheadUI.destroy();
    }
    super.destroy(fromScene);
  }
}
