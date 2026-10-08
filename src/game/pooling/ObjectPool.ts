/**
 * Generic Contiguous Object Pool for Zero-GC Simulation and VFX
 *
 * Implements strict O(1) acquire/release, dense O(activeCount) traversal,
 * double-release guards, and typed-array index management with ZERO runtime allocations.
 */

export interface IPoolable {
  reset(): void;
}

export interface ObjectPoolOptions<T> {
  capacity: number;
  factory: (index: number) => T;
  reset?: (item: T) => void;
  onAcquire?: (item: T) => void;
}

export class ObjectPool<T> {
  public readonly capacity: number;
  private readonly storage: T[];
  private readonly freeIndices: Int32Array;
  private freeHead: number;
  private readonly activeIndices: Int32Array;
  private readonly itemToActiveSlot: Int32Array;
  private readonly activeFlags: Uint8Array;
  private readonly itemToIndexMap: Map<T, number>;
  private _activeCount: number = 0;
  private resetCallback?: (item: T) => void;
  private acquireCallback?: (item: T) => void;

  constructor(
    optionsOrFactory: ObjectPoolOptions<T> | ((index: number) => T),
    resetArg?: (item: T) => void,
    capacityArg?: number
  ) {
    let options: ObjectPoolOptions<T>;
    if (typeof optionsOrFactory === 'function') {
      if (typeof resetArg === 'object' && resetArg !== null) {
        const obj = resetArg as Record<string, unknown>;
        options = {
          factory: optionsOrFactory,
          reset: typeof obj.reset === 'function' ? (obj.reset as (item: T) => void) : undefined,
          onAcquire: typeof obj.onAcquire === 'function' ? (obj.onAcquire as (item: T) => void) : undefined,
          capacity: typeof obj.capacity === 'number' ? obj.capacity : (typeof capacityArg === 'number' ? capacityArg : 64),
        };
      } else {
        options = {
          factory: optionsOrFactory,
          reset: typeof resetArg === 'function' ? resetArg : undefined,
          capacity: typeof capacityArg === 'number' ? capacityArg : 64,
        };
      }
    } else {
      options = optionsOrFactory;
    }

    if (!options || typeof options.capacity !== 'number' || !Number.isFinite(options.capacity) || options.capacity <= 0 || !Number.isInteger(options.capacity)) {
      throw new Error(`ObjectPool capacity must be greater than 0, got ${options?.capacity}`);
    }

    this.capacity = options.capacity;
    this.storage = new Array<T>(this.capacity);
    this.freeIndices = new Int32Array(this.capacity);
    this.activeIndices = new Int32Array(this.capacity);
    this.itemToActiveSlot = new Int32Array(this.capacity);
    this.activeFlags = new Uint8Array(this.capacity);
    this.itemToIndexMap = new Map<T, number>();
    this.resetCallback = options.reset;
    this.acquireCallback = options.onAcquire;

    this.freeHead = this.capacity;
    this._activeCount = 0;

    for (let i = 0; i < this.capacity; i++) {
      const item = options.factory(i);
      this.storage[i] = item;
      this.freeIndices[i] = i;
      this.activeIndices[i] = -1;
      this.itemToActiveSlot[i] = -1;
      this.activeFlags[i] = 0;
      this.itemToIndexMap.set(item, i);
    }
  }

  public get activeCount(): number {
    return this._activeCount;
  }

  public get freeCount(): number {
    return this.freeHead;
  }

  public get isExhausted(): boolean {
    return this.freeHead === 0;
  }

  /**
   * Acquires a pre-allocated object from the pool in O(1).
   * Returns null if capacity is exhausted. Zero heap allocations.
   */
  public acquire(): T | null {
    if (this.freeHead <= 0 || this.freeHead > this.capacity || this.storage.length === 0) {
      return null;
    }

    const itemIndex = this.freeIndices[--this.freeHead];
    if (itemIndex < 0 || itemIndex >= this.capacity) {
      this.freeHead++;
      return null;
    }

    if (this._activeCount < 0 || this._activeCount >= this.capacity) {
      this.freeHead++;
      return null;
    }

    const slot = this._activeCount++;

    this.activeIndices[slot] = itemIndex;
    this.itemToActiveSlot[itemIndex] = slot;
    this.activeFlags[itemIndex] = 1;

    const item = this.storage[itemIndex];
    if (this.acquireCallback) {
      try {
        this.acquireCallback(item);
      } catch {
        // Safe callback execution
      }
    }
    return item;
  }

  /**
   * Releases an active object back to the pool in O(1) via swap-and-pop.
   * Safely ignores duplicate release or objects not owned by this pool.
   */
  public release(item: T): boolean {
    const itemIndex = this.itemToIndexMap.get(item);
    if (itemIndex === undefined || itemIndex < 0 || itemIndex >= this.capacity) {
      return false; // Not managed by this pool
    }

    if (this.activeFlags[itemIndex] === 0) {
      return false; // Already released (double-release guard)
    }

    if (this._activeCount <= 0 || this._activeCount > this.capacity) {
      return false; // Invariant guard against underflow
    }

    const slot = this.itemToActiveSlot[itemIndex];
    if (slot < 0 || slot >= this._activeCount || slot >= this.capacity) {
      return false; // Invariant guard against slot corruption
    }

    const lastSlot = --this._activeCount;

    if (slot !== lastSlot) {
      if (lastSlot >= 0 && lastSlot < this.capacity) {
        const swappedItemIndex = this.activeIndices[lastSlot];
        if (swappedItemIndex >= 0 && swappedItemIndex < this.capacity) {
          this.activeIndices[slot] = swappedItemIndex;
          this.itemToActiveSlot[swappedItemIndex] = slot;
        }
      }
    }

    if (lastSlot >= 0 && lastSlot < this.capacity) {
      this.activeIndices[lastSlot] = -1;
    }
    this.itemToActiveSlot[itemIndex] = -1;
    if (this.freeHead >= 0 && this.freeHead < this.capacity) {
      this.freeIndices[this.freeHead++] = itemIndex;
    }
    this.activeFlags[itemIndex] = 0;

    // Strictly enforce IPoolable.reset() if present
    if (item && typeof (item as unknown as IPoolable).reset === 'function') {
      try {
        (item as unknown as IPoolable).reset();
      } catch {
        // Guard against custom reset method errors corrupting pool invariants
      }
    }

    // Strictly enforce options.reset callback if present
    if (this.resetCallback) {
      try {
        this.resetCallback(item);
      } catch {
        // Guard against custom reset callback errors corrupting pool invariants
      }
    }

    return true;
  }

  /**
   * Iterates through all currently active items in dense contiguous order.
   * Zero heap allocations.
   */
  public forEachActive(callback: (item: T, index: number) => void): void {
    let i = 0;
    while (i < this._activeCount && i < this.capacity) {
      const itemIndex = this.activeIndices[i];
      if (itemIndex >= 0 && itemIndex < this.capacity) {
        const item = this.storage[itemIndex];
        callback(item, i);
      }
      if (i < this._activeCount && i < this.capacity && this.activeIndices[i] === itemIndex) {
        i++;
      } else if (i < this._activeCount && i < this.capacity && this.activeIndices[i] !== itemIndex) {
        // Swap-and-pop occurred at current slot i during callback
      } else {
        break;
      }
    }
  }

  /**
   * Checks whether a specific item is currently active in O(1).
   */
  public isActive(item: T): boolean {
    const itemIndex = this.itemToIndexMap.get(item);
    if (itemIndex === undefined || itemIndex < 0 || itemIndex >= this.capacity) return false;
    return this.activeFlags[itemIndex] === 1;
  }

  /**
   * Verifies structural invariants without allocating heap memory:
   * 1. activeCount + freeCount === capacity
   * 2. 0 <= activeCount <= capacity and 0 <= freeCount <= capacity
   * 3. storage and typed buffer sizes invariant
   * 4. Bijective mapping between active slots and item indices
   */
  public verifyInvariants(): boolean {
    if (this._activeCount + this.freeHead !== this.capacity) return false;
    if (this._activeCount < 0 || this._activeCount > this.capacity) return false;
    if (this.freeHead < 0 || this.freeHead > this.capacity) return false;
    if (this.storage.length !== this.capacity) return false;
    if (this.freeIndices.length !== this.capacity) return false;
    if (this.activeIndices.length !== this.capacity) return false;
    if (this.itemToActiveSlot.length !== this.capacity) return false;
    if (this.activeFlags.length !== this.capacity) return false;
    if (this.itemToIndexMap.size !== this.capacity) return false;

    for (let slot = 0; slot < this._activeCount; slot++) {
      const itemIdx = this.activeIndices[slot];
      if (itemIdx < 0 || itemIdx >= this.capacity) return false;
      if (this.activeFlags[itemIdx] !== 1) return false;
      if (this.itemToActiveSlot[itemIdx] !== slot) return false;
    }

    return true;
  }

  /**
   * Resets all active items back to the pool, invoking reset callbacks.
   */
  public reset(): void {
    const count = Math.min(this._activeCount, this.capacity);
    for (let i = 0; i < count; i++) {
      const itemIndex = this.activeIndices[i];
      if (itemIndex >= 0 && itemIndex < this.capacity) {
        const item = this.storage[itemIndex];
        this.activeFlags[itemIndex] = 0;
        this.itemToActiveSlot[itemIndex] = -1;
        this.activeIndices[i] = -1;
        if (item && typeof (item as unknown as IPoolable).reset === 'function') {
          try {
            (item as unknown as IPoolable).reset();
          } catch {}
        }
        if (this.resetCallback) {
          try {
            this.resetCallback(item);
          } catch {}
        }
      }
    }

    this._activeCount = 0;
    this.freeHead = this.capacity;
    for (let i = 0; i < this.capacity; i++) {
      this.freeIndices[i] = i;
    }
  }

  /**
   * Releases all resources and clears references for complete teardown.
   */
  public destroy(): void {
    this.reset();
    this.storage.length = 0;
    this.freeHead = 0;
    this._activeCount = 0;
    this.itemToIndexMap.clear();
    this.resetCallback = undefined;
    this.acquireCallback = undefined;
  }

  public clear(): void {
    this.reset();
  }

  public dispose(): void {
    this.destroy();
  }
}

/**
 * Standard pool capacities mandated by PROJECT.md
 */
export const POOL_PRESETS = {
  BOMBS: 32,
  EXPLOSIONS: 128,
  PARTICLES: 256,
  ITEM_DROPS: 48,
  FLOATING_TEXT: 32,
  GHOST_BOMBS: 16,
  HAZARD_BEAM_TILES: 32,
  GRAPHICS: 128,
  SHADOWS: 128,
  DEBRIS: 256,
} as const;
