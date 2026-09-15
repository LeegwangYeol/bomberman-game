import type Phaser from 'phaser';
import { BaseEntity } from './BaseEntity';
import {
  EnemyType,
  NeutralType,
  AllyType,
} from './types';
import {
  ChaserEnemy,
  BomberEnemy,
  TankEnemy,
  GhostEnemy,
  SplitterEnemy,
} from './EnemyEntities';
import {
  MerchantNPC,
  CritterNPC,
} from './NeutralEntities';
import {
  MiniBomberAlly,
  PetDroneAlly,
  ShieldGuardAlly,
} from './AllyEntities';

export * from './types';
export * from './OverheadUI';
export * from './BaseEntity';
export * from './EnemyEntities';
export * from './NeutralEntities';
export * from './AllyEntities';

/**
 * Factory helper for spawning enemies by archetype.
 */
export function createEnemy(
  scene: Phaser.Scene,
  type: EnemyType,
  x: number,
  y: number
): BaseEntity {
  switch (type) {
    case 'CHASER':
      return new ChaserEnemy(scene, x, y);
    case 'BOMBER':
      return new BomberEnemy(scene, x, y);
    case 'TANK':
      return new TankEnemy(scene, x, y);
    case 'GHOST':
      return new GhostEnemy(scene, x, y);
    case 'SPLITTER':
      return new SplitterEnemy(scene, x, y);
    default:
      return new ChaserEnemy(scene, x, y);
  }
}

/**
 * Factory helper for spawning neutral NPCs.
 */
export function createNeutral(
  scene: Phaser.Scene,
  type: NeutralType,
  x: number,
  y: number
): BaseEntity {
  switch (type) {
    case 'MERCHANT':
      return new MerchantNPC(scene, x, y);
    case 'CRITTER':
      return new CritterNPC(scene, x, y);
    default:
      return new CritterNPC(scene, x, y);
  }
}

/**
 * Factory helper for spawning AI allies.
 */
export function createAlly(
  scene: Phaser.Scene,
  type: AllyType,
  x: number,
  y: number
): BaseEntity {
  switch (type) {
    case 'MINI_BOMBER':
      return new MiniBomberAlly(scene, x, y);
    case 'PET_DRONE':
      return new PetDroneAlly(scene, x, y);
    case 'SHIELD_GUARD':
      return new ShieldGuardAlly(scene, x, y);
    default:
      return new MiniBomberAlly(scene, x, y);
  }
}
