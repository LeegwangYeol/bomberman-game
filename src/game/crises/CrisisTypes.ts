/**
 * CrisisTypes.ts — Universal types and interfaces for Stellaris-Style Map Crises Subsystem
 */

export const CrisisType = {
  PASTEL_VOID: 'pastel_void',
  CLOCKWORK_REBELLION: 'clockwork_rebellion',
  ORBITAL_BOMBARDMENT: 'orbital_bombardment',
  SOLAR_FLARES: 'solar_flares',
  CREEPING_LAVA: 'creeping_lava',
  DIMENSIONAL_RIFTS: 'dimensional_rifts',
} as const;

export type CrisisType = typeof CrisisType[keyof typeof CrisisType];

export const CrisisStage = {
  INACTIVE: 'INACTIVE',
  WHISPERS: 'WHISPERS',
  OUTBREAK: 'OUTBREAK',
  CLIMAX: 'CLIMAX',
  RESOLVED: 'RESOLVED',
  FAILED: 'FAILED',
} as const;

export type CrisisStage = typeof CrisisStage[keyof typeof CrisisStage];

export const HazardType = {
  NONE: 0,
  VOID_CREEP: 1,
  VOID_RIFT: 2,
  PURIFICATION_PRISM: 3,
  CONVEYOR_BELT: 4,
  EMP_PULSE: 5,
  BRASS_COG: 6,
  DYNAMO_CONDUIT: 7,
  KINETIC_TARGET: 8,
  KINETIC_CRATER: 9,
  UPLINK_TERMINAL: 10,
  SOLAR_SWEEP: 11,
  THERMAL_VENT: 12,
  LAVA_SURFACE: 13,
  OBSIDIAN_BLOCK: 14,
  CALDERA_VALVE: 15,
  DIMENSIONAL_WARP: 16,
  QUANTUM_SPIRE: 17,
} as const;

export type HazardType = typeof HazardType[keyof typeof HazardType];

export interface HazardTile {
  idx: number; // 0..194 (r * COLS + c)
  r: number;
  c: number;
  type: HazardType;
  intensity: number; // 0.0 to 1.0 (e.g. telegraph/danger intensity)
  durationMs: number;
  remainingMs: number;
  data?: number; // Contextual metadata (direction, charge percentage, etc.)
}

export interface CrisisObjective {
  id: string;
  title: string;
  description: string;
  targetCount: number;
  currentCount: number;
  isCompleted: boolean;
  isFailed?: boolean;
  timeLimitMs?: number;
  remainingTimeMs?: number;
}

export interface CrisisThreatAlert {
  id: string;
  title: string;
  message: string;
  level: 'info' | 'warning' | 'danger' | 'critical';
  icon: string;
  durationMs: number;
  remainingMs: number;
}

export interface CrisisStatus {
  isActive: boolean;
  crisisType: CrisisType | null;
  stage: CrisisStage;
  threatMeter: number; // 0.0 - 100.0
  threatTrend: 'stable' | 'rising' | 'critical' | 'declining';
  stageElapsedMs: number;
  stageDurationMs: number;
  stageRemainingMs: number;
  objectives: CrisisObjective[];
  activeAlert: CrisisThreatAlert | null;
  hazardTileCount: number;
  isVictorious: boolean;
  isDefeated: boolean;
  summary: string;
}

export interface SituationLogState {
  isActive: boolean;
  crisisId: CrisisType | '';
  crisisName: string;
  crisisIcon: string;
  themeColor: string;
  stage: CrisisStage;
  stageName: string;
  threatLevel: number; // 0 - 100
  threatTrend: 'stable' | 'rising' | 'critical' | 'declining';
  stageRemainingMs: number;
  totalDurationMs: number;
  elapsedMs: number;
  objectives: CrisisObjective[];
  activeAlert: CrisisThreatAlert | null;
  hazardCount: number;
  statusDescription: string;
  isVictorious: boolean;
  isDefeated: boolean;
}

export interface CrisisDefinition {
  id: CrisisType;
  name: string;
  icon: string;
  themeColor: string;
  description: string;
  stageDurations: {
    [CrisisStage.WHISPERS]: number;
    [CrisisStage.OUTBREAK]: number;
    [CrisisStage.CLIMAX]: number;
  };
}

export const CRISIS_DEFINITIONS: Record<CrisisType, CrisisDefinition> = {
  [CrisisType.PASTEL_VOID]: {
    id: CrisisType.PASTEL_VOID,
    name: 'Pastel Void Incursion',
    icon: '🌀🌌',
    themeColor: '#8A2BE2',
    description: 'Subspace cosmic tear devouring candy corridors with creeping void.',
    stageDurations: {
      [CrisisStage.WHISPERS]: 20000,
      [CrisisStage.OUTBREAK]: 55000,
      [CrisisStage.CLIMAX]: 35000,
    },
  },
  [CrisisType.CLOCKWORK_REBELLION]: {
    id: CrisisType.CLOCKWORK_REBELLION,
    name: 'Clockwork Toy Rebellion',
    icon: '🤖⚙️',
    themeColor: '#D97706',
    description: 'Autonomous brass toys taking over the arena with conveyors and EMP pulses.',
    stageDurations: {
      [CrisisStage.WHISPERS]: 20000,
      [CrisisStage.OUTBREAK]: 55000,
      [CrisisStage.CLIMAX]: 35000,
    },
  },
  [CrisisType.ORBITAL_BOMBARDMENT]: {
    id: CrisisType.ORBITAL_BOMBARDMENT,
    name: 'Orbital Bombardment',
    icon: '☄️🚀',
    themeColor: '#EF4444',
    description: 'Alien dreadnought raining kinetic slugs and macrocannon lances from orbit.',
    stageDurations: {
      [CrisisStage.WHISPERS]: 20000,
      [CrisisStage.OUTBREAK]: 55000,
      [CrisisStage.CLIMAX]: 35000,
    },
  },
  [CrisisType.SOLAR_FLARES]: {
    id: CrisisType.SOLAR_FLARES,
    name: 'Solar Flare Storm',
    icon: '☀️🔥',
    themeColor: '#F59E0B',
    description: 'Coronal mass ejection sweeping cardinal corridors and flash-igniting bombs.',
    stageDurations: {
      [CrisisStage.WHISPERS]: 20000,
      [CrisisStage.OUTBREAK]: 55000,
      [CrisisStage.CLIMAX]: 35000,
    },
  },
  [CrisisType.CREEPING_LAVA]: {
    id: CrisisType.CREEPING_LAVA,
    name: 'Creeping Lava Fissure',
    icon: '🌋🔥',
    themeColor: '#DC2626',
    description: 'Tectonic mantle rupture advancing molten magma inward toward the caldera.',
    stageDurations: {
      [CrisisStage.WHISPERS]: 20000,
      [CrisisStage.OUTBREAK]: 55000,
      [CrisisStage.CLIMAX]: 35000,
    },
  },
  [CrisisType.DIMENSIONAL_RIFTS]: {
    id: CrisisType.DIMENSIONAL_RIFTS,
    name: 'Dimensional Rift Inversion',
    icon: '🌀🪞',
    themeColor: '#8B5CF6',
    description: 'Subspace rifts tearing reality with toroidal edge-warping corridors.',
    stageDurations: {
      [CrisisStage.WHISPERS]: 20000,
      [CrisisStage.OUTBREAK]: 55000,
      [CrisisStage.CLIMAX]: 35000,
    },
  },
};

export interface ICrisis {
  readonly id: CrisisType;
  readonly name: string;
  readonly icon: string;
  readonly themeColor: string;
  getStage(): CrisisStage;
  getThreat(): number;
  getObjectives(): CrisisObjective[];
  getActiveAlert(): CrisisThreatAlert | null;
  getStatus(): CrisisStatus;
  init(): void;
  update(deltaMs: number, playerPos?: { r: number; c: number; x?: number; y?: number }): void;
  handleBombBlast(r: number, c: number, radius?: number): void;
  resolveObjective(objectiveId: string, value?: number): void;
  getActiveHazardTiles(): HazardTile[];
  isTileHazardous(r: number, c: number): boolean;
  getHazardAt(r: number, c: number): HazardTile | null;
  reset(): void;
}
