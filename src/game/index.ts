/**
 * src/game/index.ts — Unified Root Engine Barrel
 *
 * Provides a clean, consolidated export surface for GameScene, gameplay mechanics,
 * pathfinding, input states, ultimate skills, hazards, bosses, crises, entities,
 * meta-progression, persistence, UI, pooling, and procedural graphics subsystems.
 */

export { default as GameScene } from './GameScene.ts';
export * from './gameplay_mechanics.ts';
export * from './pathfinding.ts';
export * from './input_state.ts';
export * from './ultimate_skills.ts';

// Hazards Subsystem
export * as Hazards from './hazards/index.ts';
export * from './hazards/index.ts';

// Bosses Subsystem (Namespaced to prevent scope collisions with crises/hazards)
export * as Bosses from './bosses/index.ts';

// Crises Subsystem (Namespaced to prevent scope collisions with bosses)
export * as Crises from './crises/index.ts';

// Entities & Spatial Separation Subsystem
export * from './entities/index.ts';

// Meta-Progression & Wave Director Subsystem
export * from './progression/index.ts';

// Persistence Subsystem (GameStatePersistence, CircuitBreaker, Types)
export * as Persistence from './persistence/index.ts';
export * from './persistence/index.ts';

// UI Subsystem (FloatingTextManager & OverheadUIManager)
export * as UI from './ui/index.ts';
export * from './ui/index.ts';

// Object & Voice Pooling Subsystem
export * as Pooling from './pooling/index.ts';
export * from './pooling/index.ts';

// Procedural Graphics Subsystem
export * as Graphics from './graphics/index.ts';
export * from './graphics/index.ts';
