/**
 * Generic Contiguous Object Pool for Zero-GC Simulation and VFX
 *
 * Implements strict O(1) acquire/release, dense O(activeCount) traversal,
 * double-release guards, and typed-array index management with ZERO runtime allocations.
 */

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
  private readonly resetCallback?: (item: T) => void;
  private readonly acquireCallback?: (item: T) => void;

  constructor(options: ObjectPoolOptions<T>) {
    if (options.capacity <= 0) {
      throw new Error(`ObjectPool capacity must be greater than 0, got ${options.capacity}`);
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
    if (this.freeHead <= 0) {
      return null;
    }

    const itemIndex = this.freeIndices[--this.freeHead];
    const slot = this._activeCount++;

    this.activeIndices[slot] = itemIndex;
    this.itemToActiveSlot[itemIndex] = slot;
    this.activeFlags[itemIndex] = 1;

    const item = this.storage[itemIndex];
    if (this.acquireCallback) {
      this.acquireCallback(item);
    }
    return item;
  }

  /**
   * Releases an active object back to the pool in O(1) via swap-and-pop.
   * Safely ignores duplicate release or objects not owned by this pool.
   */
  public release(item: T): boolean {
    const itemIndex = this.itemToIndexMap.get(item);
    if (itemIndex === undefined) {
      return false; // Not managed by this pool
    }

    if (this.activeFlags[itemIndex] === 0) {
      return false; // Already released (double-release guard)
    }

    this.activeFlags[itemIndex] = 0;
    if (this.resetCallback) {
      this.resetCallback(item);
    }

    const slot = this.itemToActiveSlot[itemIndex];
    const lastSlot = --this._activeCount;

    if (slot !== lastSlot) {
      const swappedItemIndex = this.activeIndices[lastSlot];
      this.activeIndices[slot] = swappedItemIndex;
      this.itemToActiveSlot[swappedItemIndex] = slot;
    }

    this.activeIndices[lastSlot] = -1;
    this.itemToActiveSlot[itemIndex] = -1;
    this.freeIndices[this.freeHead++] = itemIndex;

    return true;
  }

  /**
   * Iterates through all currently active items in dense contiguous order.
   * Zero heap allocations.
   */
  public forEachActive(callback: (item: T, index: number) => void): void {
    const count = this._activeCount;
    for (let i = 0; i < count; i++) {
      const itemIndex = this.activeIndices[i];
      callback(this.storage[itemIndex], i);
    }
  }

  /**
   * Checks whether a specific item is currently active in O(1).
   */
  public isActive(item: T): boolean {
    const itemIndex = this.itemToIndexMap.get(item);
    if (itemIndex === undefined) return false;
    return this.activeFlags[itemIndex] === 1;
  }

  /**
   * Resets all active items back to the pool, invoking reset callbacks.
   */
  public reset(): void {
    const count = this._activeCount;
    for (let i = 0; i < count; i++) {
      const itemIndex = this.activeIndices[i];
      this.activeFlags[itemIndex] = 0;
      this.itemToActiveSlot[itemIndex] = -1;
      this.activeIndices[i] = -1;
      if (this.resetCallback) {
        this.resetCallback(this.storage[itemIndex]);
      }
    }

    this._activeCount = 0;
    this.freeHead = this.capacity;
    for (let i = 0; i < this.capacity; i++) {
      this.freeIndices[i] = i;
    }
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
} as const;
