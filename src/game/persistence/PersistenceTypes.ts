/**
 * PersistenceTypes.ts — Universal types and interfaces for Game State Persistence,
 * Checksum Verification, Dual-Tier Storage, and API 429 Circuit Breaking.
 */

import type { PlayerStats } from '../gameplay_mechanics.ts';
import { GameModeType } from '../progression/ProgressionTypes.ts';
import type {
  MetaProfile,
  RunProgressionState,
} from '../progression/ProgressionTypes.ts';

export const STORAGE_KEY_ACTIVE_RUN = 'bomberman_save_active';
export const STORAGE_KEY_META_PROFILE = 'bomberman_profile_v1';
export const STORAGE_SCHEMA_VERSION = 1;
export const EXPORT_APP_IDENTIFIER = 'bomberman-infinite-evolution';

export type SaveTriggerType =
  | 'auto'
  | 'pause'
  | 'stage_clear'
  | 'quota_429'
  | 'page_hide'
  | 'manual';

export interface SerializedBoard {
  rows: number;
  cols: number;
  mapRLE: string; // Run-Length Encoded 2D tile matrix
  map?: number[][];
  conveyors?: Array<{ x: number; y: number; direction: 'up' | 'down' | 'left' | 'right' }>;
  portals?: {
    portalA: { x: number; y: number };
    portalB: { x: number; y: number };
  };
}

export interface SerializedPlayer {
  x: number;
  y: number;
  gridRow: number;
  gridCol: number;
  facing: 'up' | 'down' | 'left' | 'right';
  stats: PlayerStats;
  hp: number;
  invulnerableRemainingMs?: number;
}

export interface SerializedBomb {
  id: string | number;
  x: number;
  y: number;
  row: number;
  col: number;
  fuseRemainingMs: number;
  power: number;
  owner: string;
  bombType: string;
}

export interface SerializedEntity {
  id: string | number;
  archetype: string;
  faction: 'enemy' | 'neutral' | 'ally';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  aiState: string;
}

export interface SerializedItem {
  row: number;
  col: number;
  itemType: string;
  spawnTime: number;
}

export interface SerializedRunMeta {
  runId: string;
  stageIndex: number;
  gameMode: GameModeType;
  score: number;
  elapsedTimeMs: number;
  activeCrisesCount?: number;
  bossEncounterActive?: boolean;
}

export interface SerializedRunState {
  version: number;
  timestamp: number;
  saveTrigger: SaveTriggerType;
  meta: SerializedRunMeta;
  player: SerializedPlayer;
  board: SerializedBoard;
  activeBombs: SerializedBomb[];
  activeEntities: SerializedEntity[];
  activeItems: SerializedItem[];
  progression?: RunProgressionState;
  checksum: string;
}

export interface SerializedMetaProfileEnvelope {
  version: number;
  timestamp: number;
  profile: MetaProfile;
  checksum: string;
}

export interface GameSaveExportPackage {
  version: number;
  exportTimestamp: number;
  exportApp: typeof EXPORT_APP_IDENTIFIER;
  runState: SerializedRunState | null;
  metaProfile: MetaProfile;
  checksum: string;
}

export interface IStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export const CircuitBreakerState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;

export type CircuitBreakerState =
  typeof CircuitBreakerState[keyof typeof CircuitBreakerState];

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  jitterRatio?: number;
  maxQueueSize?: number;
  onStateChange?: (from: CircuitBreakerState, to: CircuitBreakerState) => void;
  onQuotaError?: (error: unknown) => void;
}

export interface QueuedApiRequest<T = unknown> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  retries: number;
  timestamp: number;
}
