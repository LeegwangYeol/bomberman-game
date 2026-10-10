/**
 * src/game/index.ts — Unified Root Engine Barrel
 *
 * Provides a clean, consolidated export surface for GameScene, gameplay mechanics,
 * pathfinding, input states, ultimate skills, hazards, bosses, crises, entities,
 * and meta-progression subsystems.
 */

export { default as GameScene } from './GameScene.ts';
export * from './gameplay_mechanics.ts';
export * from './pathfinding.ts';
export * from './input_state.ts';
export * from './ultimate_skills.ts';
export * from './hazards/index.ts';
export * as Bosses from './bosses/index.ts';
export * as Crises from './crises/index.ts';
export * from './entities/index.ts';
export * from './progression/index.ts';
export * from './persistence/GameStatePersistence.ts';
