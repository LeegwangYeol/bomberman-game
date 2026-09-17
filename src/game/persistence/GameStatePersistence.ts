/**
 * GameStatePersistence.ts — Dual-tier (SessionStorage + LocalStorage) Game State Persistence Engine
 * featuring Run-Length Encoding (RLE) map compression, cryptographic/canonical checksum verification,
 * tamper resistance, full JSON export/import, and API 429 Circuit Breaker integration.
 */

import {
  STORAGE_KEY_ACTIVE_RUN,
  STORAGE_KEY_META_PROFILE,
  STORAGE_SCHEMA_VERSION,
  EXPORT_APP_IDENTIFIER,
} from './PersistenceTypes.ts';
import type {
  SerializedRunState,
  SerializedMetaProfileEnvelope,
  GameSaveExportPackage,
  IStorageAdapter,
} from './PersistenceTypes.ts';
import {
  GameModeType,
  RelicId,
} from '../progression/ProgressionTypes.ts';
import type {
  MetaProfile,
} from '../progression/ProgressionTypes.ts';
import { APIQuotaCircuitBreaker } from './CircuitBreaker.ts';

/* ==============================================================================
 * STORAGE ADAPTERS (IN-MEMORY & BROWSER WEB STORAGE)
 * ============================================================================== */

export class MemoryStorageAdapter implements IStorageAdapter {
  private store = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }
}

export class WebStorageAdapter implements IStorageAdapter {
  private storage: Storage | null;
  private fallback = new MemoryStorageAdapter();

  constructor(type: 'session' | 'local') {
    try {
      if (typeof window !== 'undefined') {
        this.storage = type === 'session' ? window.sessionStorage : window.localStorage;
        // Verify storage works
        const testKey = `__test_${Date.now()}`;
        this.storage.setItem(testKey, '1');
        this.storage.removeItem(testKey);
      } else {
        this.storage = null;
      }
    } catch {
      this.storage = null;
    }
  }

  public getItem(key: string): string | null {
    if (this.storage) {
      try {
        return this.storage.getItem(key);
      } catch {
        return this.fallback.getItem(key);
      }
    }
    return this.fallback.getItem(key);
  }

  public setItem(key: string, value: string): void {
    if (this.storage) {
      try {
        this.storage.setItem(key, value);
        return;
      } catch {
        // Fallback to memory on quota error or exception
        this.fallback.setItem(key, value);
        return;
      }
    }
    this.fallback.setItem(key, value);
  }

  public removeItem(key: string): void {
    if (this.storage) {
      try {
        this.storage.removeItem(key);
      } catch {
        // Ignore
      }
    }
    this.fallback.removeItem(key);
  }

  public clear(): void {
    if (this.storage) {
      try {
        this.storage.clear();
      } catch {
        // Ignore
      }
    }
    this.fallback.clear();
  }
}

/* ==============================================================================
 * RUN-LENGTH ENCODING (RLE) FOR MAP GRIDS
 * ============================================================================== */

/**
 * Compresses a 2D integer matrix into a compact RLE string (e.g. "15x1,1x1,13x0,1x1...").
 */
export function compressGrid(grid: number[][]): string {
  if (!grid || !Array.isArray(grid) || grid.length === 0) return '';
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (cols === 0) return '';

  const runs: string[] = [];
  let currentVal = grid[0][0];
  let currentCount = 0;

  for (let r = 0; r < rows; r++) {
    const row = grid[r];
    for (let c = 0; c < cols; c++) {
      const val = row[c];
      if (val === currentVal) {
        currentCount++;
      } else {
        runs.push(`${currentCount}x${currentVal}`);
        currentVal = val;
        currentCount = 1;
      }
    }
  }

  if (currentCount > 0) {
    runs.push(`${currentCount}x${currentVal}`);
  }

  return runs.join(',');
}

/**
 * Decompresses an RLE string back into a 2D integer matrix of dimensions rows x cols.
 */
export function decompressGrid(rle: string, rows: number, cols: number): number[][] {
  const result: number[][] = [];
  for (let r = 0; r < rows; r++) {
    result.push(new Array(cols).fill(0));
  }

  if (!rle || typeof rle !== 'string' || rle.trim().length === 0) {
    return result;
  }

  const expectedTotal = rows * cols;
  const tokens = rle.split(',');
  let filled = 0;

  for (const token of tokens) {
    if (!token) continue;
    const parts = token.split('x');
    if (parts.length !== 2) {
      throw new Error(`Invalid RLE token: "${token}"`);
    }

    const count = parseInt(parts[0], 10);
    const val = parseInt(parts[1], 10);

    if (isNaN(count) || isNaN(val) || count <= 0) {
      throw new Error(`Malformed RLE values in token: "${token}"`);
    }

    for (let i = 0; i < count; i++) {
      const currentIdx = filled + i;
      if (currentIdx >= expectedTotal) {
        throw new Error(
          `Decompressed element count exceeded expected grid size (${expectedTotal})`
        );
      }
      const r = Math.floor(currentIdx / cols);
      const c = currentIdx % cols;
      result[r][c] = val;
    }
    filled += count;
  }

  if (filled !== expectedTotal) {
    throw new Error(
      `RLE decompression count mismatch: got ${filled}, expected ${expectedTotal}`
    );
  }

  return result;
}

/* ==============================================================================
 * CANONICAL SERIALIZATION & CHECKSUM HASHING
 * ============================================================================== */

const INTEGRITY_SALT = 'BOMBERMAN_INTEGRITY_SALT_V1_2026';

/**
 * Serializes an arbitrary JavaScript object into a deterministic canonical JSON string.
 * Keys are sorted recursively, undefined values omitted, and numbers formatted predictably.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj)
    .filter((k) => k !== 'checksum' && obj[k] !== undefined)
    .sort();

  const entries = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`
  );

  return `{${entries.join(',')}}`;
}

/**
 * Computes a deterministic 24-character hexadecimal checksum using 64-bit FNV-1a
 * combined with 32-bit DJB2 hash seeded with INTEGRITY_SALT.
 */
export function calculateChecksum(data: unknown): string {
  const canonical = canonicalStringify(data);
  const input = `${INTEGRITY_SALT}:${canonical}`;

  // 1. 64-bit FNV-1a
  let fnv = BigInt('0xcbf29ce484222325');
  const fnvPrime = BigInt('0x100000001b3');
  const fnvMask = BigInt('0xffffffffffffffff');

  for (let i = 0; i < input.length; i++) {
    fnv ^= BigInt(input.charCodeAt(i));
    fnv = (fnv * fnvPrime) & fnvMask;
  }

  // 2. 32-bit DJB2 variant
  let djb = 5381;
  for (let i = 0; i < input.length; i++) {
    djb = ((djb << 5) + djb + input.charCodeAt(i)) & 0xffffffff;
  }

  const fnvHex = fnv.toString(16).padStart(16, '0');
  const djbHex = (djb >>> 0).toString(16).padStart(8, '0');

  return `${fnvHex}${djbHex}`;
}

/**
 * Verifies that the provided data matches the expected checksum in constant time.
 */
export function verifyChecksum(data: unknown, expectedChecksum: string): boolean {
  if (!expectedChecksum || typeof expectedChecksum !== 'string') return false;
  const computed = calculateChecksum(data);
  if (computed.length !== expectedChecksum.length) return false;

  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ expectedChecksum.charCodeAt(i);
  }

  return mismatch === 0;
}

/* ==============================================================================
 * GAME STATE PERSISTENCE MANAGER
 * ============================================================================== */

export class GameStatePersistence {
  private static instance: GameStatePersistence | null = null;

  private sessionAdapter: IStorageAdapter;
  private localAdapter: IStorageAdapter;
  private circuitBreaker: APIQuotaCircuitBreaker;
  private cachedActiveRun: SerializedRunState | null = null;

  constructor(
    sessionAdapter?: IStorageAdapter,
    localAdapter?: IStorageAdapter,
    circuitBreaker?: APIQuotaCircuitBreaker
  ) {
    this.sessionAdapter = sessionAdapter ?? new WebStorageAdapter('session');
    this.localAdapter = localAdapter ?? new WebStorageAdapter('local');
    this.circuitBreaker = circuitBreaker ?? new APIQuotaCircuitBreaker();
  }

  public static getInstance(): GameStatePersistence {
    if (!GameStatePersistence.instance) {
      GameStatePersistence.instance = new GameStatePersistence();
    }
    return GameStatePersistence.instance;
  }

  public static resetInstance(): void {
    GameStatePersistence.instance = null;
  }

  public getCircuitBreaker(): APIQuotaCircuitBreaker {
    return this.circuitBreaker;
  }

  /* --------------------------------------------------------------------------
   * TIER 1: ACTIVE MATCH PERSISTENCE (SESSIONSTORAGE)
   * -------------------------------------------------------------------------- */

  public saveRunState(
    state: Omit<SerializedRunState, 'checksum'> | SerializedRunState
  ): SerializedRunState {
    const cloned = JSON.parse(JSON.stringify(state)) as SerializedRunState;

    // Ensure RLE compressed map is present if 2D grid provided
    if (cloned.board.map && (!cloned.board.mapRLE || cloned.board.mapRLE === '')) {
      cloned.board.mapRLE = compressGrid(cloned.board.map);
    }

    cloned.version = STORAGE_SCHEMA_VERSION;
    cloned.timestamp = Date.now();
    cloned.checksum = calculateChecksum(cloned);

    const serialized = JSON.stringify(cloned);
    this.sessionAdapter.setItem(STORAGE_KEY_ACTIVE_RUN, serialized);
    this.cachedActiveRun = cloned;

    return cloned;
  }

  public loadRunState(): SerializedRunState | null {
    const raw = this.sessionAdapter.getItem(STORAGE_KEY_ACTIVE_RUN);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as SerializedRunState;
      if (!parsed || parsed.version !== STORAGE_SCHEMA_VERSION) {
        return null;
      }

      // Checksum validation for tamper detection
      if (!verifyChecksum(parsed, parsed.checksum)) {
        console.warn(
          'GameStatePersistence: Saved run state checksum mismatch — state rejected as corrupted/tampered.'
        );
        return null;
      }

      // Decompress map grid if needed
      if (parsed.board.mapRLE && (!parsed.board.map || parsed.board.map.length === 0)) {
        try {
          parsed.board.map = decompressGrid(
            parsed.board.mapRLE,
            parsed.board.rows,
            parsed.board.cols
          );
        } catch (e) {
          console.error('GameStatePersistence: Failed to decompress map RLE', e);
        }
      }

      this.cachedActiveRun = parsed;
      return parsed;
    } catch (e) {
      console.error('GameStatePersistence: Failed to parse saved run state', e);
      return null;
    }
  }

  public hasActiveRun(): boolean {
    return this.loadRunState() !== null;
  }

  public clearRunState(): void {
    this.sessionAdapter.removeItem(STORAGE_KEY_ACTIVE_RUN);
    this.cachedActiveRun = null;
  }

  /* --------------------------------------------------------------------------
   * TIER 2: META-PROGRESSION STORE (LOCALSTORAGE)
   * -------------------------------------------------------------------------- */

  public createDefaultMetaProfile(): MetaProfile {
    return {
      version: STORAGE_SCHEMA_VERSION,
      lastUpdated: Date.now(),
      cosmicEssence: 100,
      starCandies: 50,
      perks: {},
      unlockedModes: [
        GameModeType.STANDARD,
        GameModeType.CRISIS_SURVIVAL,
        GameModeType.BOSS_RUSH,
        GameModeType.ENDLESS_GAUNTLET,
      ],
      discoveredRelics: [RelicId.POCKET_CHRONOMETER],
      equippedRelics: [RelicId.POCKET_CHRONOMETER],
      highestWaveReached: {
        [GameModeType.STANDARD]: 1,
        [GameModeType.CRISIS_SURVIVAL]: 1,
        [GameModeType.BOSS_RUSH]: 1,
        [GameModeType.ENDLESS_GAUNTLET]: 1,
      },
      bestSurvivalTimesSeconds: {
        [GameModeType.STANDARD]: 0,
        [GameModeType.CRISIS_SURVIVAL]: 0,
        [GameModeType.BOSS_RUSH]: 0,
        [GameModeType.ENDLESS_GAUNTLET]: 0,
      },
      bestBossRushTimeSeconds: null,
      trophiesUnlocked: [],
    };
  }

  public saveMetaProfile(profile: MetaProfile): SerializedMetaProfileEnvelope {
    const envelope: SerializedMetaProfileEnvelope = {
      version: STORAGE_SCHEMA_VERSION,
      timestamp: Date.now(),
      profile: {
        ...profile,
        version: STORAGE_SCHEMA_VERSION,
        lastUpdated: Date.now(),
      },
      checksum: '',
    };

    envelope.checksum = calculateChecksum(envelope.profile);
    const serialized = JSON.stringify(envelope);
    this.localAdapter.setItem(STORAGE_KEY_META_PROFILE, serialized);

    return envelope;
  }

  public loadMetaProfile(): MetaProfile {
    const raw = this.localAdapter.getItem(STORAGE_KEY_META_PROFILE);
    if (!raw) {
      const defaultProfile = this.createDefaultMetaProfile();
      this.saveMetaProfile(defaultProfile);
      return defaultProfile;
    }

    try {
      const envelope = JSON.parse(raw) as SerializedMetaProfileEnvelope;
      if (!envelope || envelope.version !== STORAGE_SCHEMA_VERSION || !envelope.profile) {
        const defaultProfile = this.createDefaultMetaProfile();
        this.saveMetaProfile(defaultProfile);
        return defaultProfile;
      }

      // Checksum validation
      if (!verifyChecksum(envelope.profile, envelope.checksum)) {
        console.warn(
          'GameStatePersistence: Meta-profile checksum mismatch — restoring safe profile defaults.'
        );
        const defaultProfile = this.createDefaultMetaProfile();
        this.saveMetaProfile(defaultProfile);
        return defaultProfile;
      }

      return envelope.profile;
    } catch {
      const defaultProfile = this.createDefaultMetaProfile();
      this.saveMetaProfile(defaultProfile);
      return defaultProfile;
    }
  }

  public resetMetaProfile(): MetaProfile {
    const defaultProfile = this.createDefaultMetaProfile();
    this.saveMetaProfile(defaultProfile);
    return defaultProfile;
  }

  /* --------------------------------------------------------------------------
   * EXPORT / IMPORT CONTROLS (JSON BUNDLE)
   * -------------------------------------------------------------------------- */

  public exportSavePackage(): string {
    const activeRun = this.loadRunState();
    const profile = this.loadMetaProfile();

    const pkg: GameSaveExportPackage = {
      version: STORAGE_SCHEMA_VERSION,
      exportTimestamp: Date.now(),
      exportApp: EXPORT_APP_IDENTIFIER,
      runState: activeRun,
      metaProfile: profile,
      checksum: '',
    };

    pkg.checksum = calculateChecksum(pkg);
    return JSON.stringify(pkg, null, 2);
  }

  public importSavePackage(jsonString: string): {
    success: boolean;
    error?: string;
    runState?: SerializedRunState | null;
    metaProfile?: MetaProfile;
  } {
    if (!jsonString || typeof jsonString !== 'string') {
      return { success: false, error: 'Empty or invalid JSON payload' };
    }

    try {
      const pkg = JSON.parse(jsonString) as GameSaveExportPackage;

      if (!pkg || typeof pkg !== 'object') {
        return { success: false, error: 'Malformed JSON package structure' };
      }

      if (pkg.exportApp !== EXPORT_APP_IDENTIFIER) {
        return {
          success: false,
          error: `Invalid application identifier: expected "${EXPORT_APP_IDENTIFIER}", got "${pkg.exportApp}"`,
        };
      }

      if (pkg.version !== STORAGE_SCHEMA_VERSION) {
        return {
          success: false,
          error: `Unsupported save format version: ${pkg.version}`,
        };
      }

      // Verify outer package checksum
      if (!verifyChecksum(pkg, pkg.checksum)) {
        return {
          success: false,
          error: 'Checksum verification failed: corrupt or tampered save package',
        };
      }

      // If run state is present in package, verify and save it
      if (pkg.runState) {
        if (!verifyChecksum(pkg.runState, pkg.runState.checksum)) {
          return {
            success: false,
            error: 'Corrupted run state checksum within save package',
          };
        }
        this.saveRunState(pkg.runState);
      }

      // Save imported meta profile
      if (pkg.metaProfile) {
        this.saveMetaProfile(pkg.metaProfile);
      }

      return {
        success: true,
        runState: pkg.runState,
        metaProfile: pkg.metaProfile,
      };
    } catch (err) {
      return {
        success: false,
        error: `JSON parsing error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /* --------------------------------------------------------------------------
   * API 429 QUOTA HANDLING & RECOVERY BRIDGE
   * -------------------------------------------------------------------------- */

  public async handleApiError(
    error: { status?: number; statusCode?: number; message?: string } | unknown,
    currentStateProvider?: () => SerializedRunState | null
  ): Promise<void> {
    const is429 =
      error &&
      typeof error === 'object' &&
      (('status' in error && (error as { status: number }).status === 429) ||
        ('statusCode' in error && (error as { statusCode: number }).statusCode === 429));

    if (is429) {
      const emergencySave = () => {
        if (currentStateProvider) {
          const state = currentStateProvider();
          if (state) {
            state.saveTrigger = 'quota_429';
            this.saveRunState(state);
          }
        } else if (this.cachedActiveRun) {
          this.cachedActiveRun.saveTrigger = 'quota_429';
          this.saveRunState(this.cachedActiveRun);
        }
      };

      this.circuitBreaker.handleQuotaError(emergencySave, error);
    } else {
      this.circuitBreaker.recordFailure(error);
    }
  }
}
