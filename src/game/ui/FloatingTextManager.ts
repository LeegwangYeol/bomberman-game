export interface ActiveFloatingText {
  x: number;
  y: number;
  spawnTime: number;
}

export class FloatingTextManager {
  public static readonly MAX_POOL = 4096;
  private static readonly MASK = 4095;
  private readonly poolX: Float32Array = new Float32Array(FloatingTextManager.MAX_POOL);
  private readonly poolY: Float32Array = new Float32Array(FloatingTextManager.MAX_POOL);
  private readonly poolTime: Float64Array = new Float64Array(FloatingTextManager.MAX_POOL);
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  private saturationOffset: number = 0;

  constructor() {
    this.poolTime.fill(-1);
  }

  public getCascadeOffset(x: number, y: number, currentTime: number): number {
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof currentTime !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(currentTime)
    ) {
      return 0;
    }

    const cutoff = currentTime - 450;
    const poolX = this.poolX;
    const poolY = this.poolY;
    const poolTime = this.poolTime;
    const mask = FloatingTextManager.MASK;

    while (this.size > 0 && poolTime[this.head] < cutoff) {
      this.head = (this.head + 1) & mask;
      this.size--;
    }

    if (this.size === 0) {
      this.head = 0;
      this.tail = 0;
      this.saturationOffset = 0;
    }

    const head = this.head;
    const size = this.size;
    let nearbyCount = 0;
    const end = head + size;
    if (end <= FloatingTextManager.MAX_POOL) {
      for (let idx = head; idx < end; idx++) {
        const dy = poolY[idx] - y;
        if (dy > 30 || dy < -30) continue;
        const dx = poolX[idx] - x;
        if (dx > 30 || dx < -30) continue;
        if (dx * dx + dy * dy <= 900) {
          nearbyCount++;
        }
      }
    } else {
      for (let idx = head; idx < FloatingTextManager.MAX_POOL; idx++) {
        const dy = poolY[idx] - y;
        if (dy > 30 || dy < -30) continue;
        const dx = poolX[idx] - x;
        if (dx > 30 || dx < -30) continue;
        if (dx * dx + dy * dy <= 900) {
          nearbyCount++;
        }
      }
      const wrapEnd = end & mask;
      for (let idx = 0; idx < wrapEnd; idx++) {
        const dy = poolY[idx] - y;
        if (dy > 30 || dy < -30) continue;
        const dx = poolX[idx] - x;
        if (dx > 30 || dx < -30) continue;
        if (dx * dx + dy * dy <= 900) {
          nearbyCount++;
        }
      }
    }

    const offset = nearbyCount * 16 + (nearbyCount >= FloatingTextManager.MAX_POOL ? this.saturationOffset : 0);

    if (this.size < FloatingTextManager.MAX_POOL) {
      const tail = this.tail;
      poolX[tail] = x;
      poolY[tail] = y;
      poolTime[tail] = currentTime;
      this.tail = (tail + 1) & mask;
      this.size++;
    } else {
      // Pool saturated: overwrite oldest active entry at head and advance both pointers
      const h = this.head;
      poolX[h] = x;
      poolY[h] = y;
      poolTime[h] = currentTime;
      this.head = (h + 1) & mask;
      this.tail = (this.tail + 1) & mask;
      if (nearbyCount >= FloatingTextManager.MAX_POOL) {
        this.saturationOffset += 16;
      }
    }

    return offset;
  }

  public registerSpawn(x: number, y: number, currentTime: number): number {
    return this.getCascadeOffset(x, y, currentTime);
  }

  public getActiveCount(currentTime?: number): number {
    if (currentTime !== undefined) {
      if (typeof currentTime !== 'number' || !Number.isFinite(currentTime)) {
        return this.size;
      }
      const cutoff = currentTime - 450;
      const poolTime = this.poolTime;
      const mask = FloatingTextManager.MASK;
      while (this.size > 0 && poolTime[this.head] < cutoff) {
        this.head = (this.head + 1) & mask;
        this.size--;
      }
      if (this.size === 0) {
        this.head = 0;
        this.tail = 0;
        this.saturationOffset = 0;
      }
    }
    return this.size;
  }

  public reset(): void {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.saturationOffset = 0;
    this.poolTime.fill(-1);
  }
}
