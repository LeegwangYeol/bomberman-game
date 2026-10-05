/**
 * Spatial Separation & Physics Collision Resolution Engine for Bomberman Entities.
 *
 * Guarantees:
 * 1. Zero Division Prevention: Identical co-located entities (dist === 0) resolve along
 *    deterministic golden-ratio radial vectors without 0/0 NaN coordinates.
 * 2. Zero-GC Uniform Spatial Grid: Pre-allocated typed-array linked lists partition entities
 *    into cell buckets, achieving O(N) neighbor queries and eliminating frame rate collapse under 100+ entities.
 * 3. Finite Coordinate Guards: NaN/Infinity defenses on position and velocity with fallback to arena center.
 * 4. Heterogeneous Mass & Phasing Support: Archetype mass weighting (Tanks push Chasers) and Ghost phasing.
 * 5. Boundary & Static Wall Confinement: Clamps resolved entities strictly inside valid bounds and out of walls.
 */

export interface SeparableEntity {
  x: number;
  y: number;
  active?: boolean;
  isDead?: boolean;
  collisionRadius?: number;
  mass?: number;
  isPhasing?: boolean;
  body?: {
    position: { x: number; y: number };
    velocity?: { x: number; y: number };
    width?: number;
    height?: number;
    halfWidth?: number;
    halfHeight?: number;
    updateCenter?: () => void;
    updateFromGameObject?: () => void;
  } | null;
}

export interface SpatialSeparationOptions {
  /** Relaxation iterations (default: 2) */
  iterations?: number;
  /** Push displacement factor between 0.0 and 1.0 (default: 0.5) */
  separationFactor?: number;
  /** Default entity collision radius if unspecified (default: 12) */
  defaultRadius?: number;
  /** Default entity mass if unspecified (default: 1.0) */
  defaultMass?: number;
  /** Arena boundary limits */
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
  /** Static solid wall obstacles to prevent pushing entities into geometry */
  walls?: Array<{ x: number; y: number; width: number; height: number }>;
  /** 2D tile map for grid obstacle checks */
  map?: number[][];
  /** Grid tile size (default: 40) */
  tileSize?: number;
  /** Spatial hash cell dimension (default: 40) */
  cellSize?: number;
  /** Restitution coefficient (elasticity) between 0.0 and 1.0 (default: 0.0) */
  restitution?: number;
  /** Velocity nudge factor proportional to overlap penetration (default: 0.0) */
  velocityNudgeFactor?: number;
  /** Maximum velocity nudge clamp in px/s to prevent cluster kinetic explosion (default: 250) */
  maxVelocityNudge?: number;
  /** Explicit flag to apply velocity nudges and restitution impulses to body.velocity */
  applyVelocityNudges?: boolean;
  /** Maximum cumulative separation displacement per tick to prevent runaway warping (default: 32.0) */
  maxDisplacement?: number;
}

export interface SpatialSeparationStats {
  entitiesProcessed: number;
  pairsChecked: number;
  overlapsResolved: number;
  zeroDistancesHandled: number;
  nanGuardsTriggered: number;
  velocityNudgesApplied: number;
  restitutionImpulsesApplied: number;
  durationMs: number;
}

/**
 * High-performance Zero-GC uniform grid for spatial neighbor queries.
 */
export class SpatialSeparationGrid {
  private cellSize: number = 40;
  private cols: number = 20;
  private rows: number = 20;
  private numCells: number = 400;

  // Linked list heads per cell: -1 indicates empty cell
  private cellHead: Int32Array = new Int32Array(1024);
  // Next pointer per entity index: -1 indicates end of chain
  private entityNext: Int32Array = new Int32Array(2048);

  // Pre-allocated typed arrays for cache-friendly contiguous data layout
  private posX: Float64Array = new Float64Array(2048);
  private posY: Float64Array = new Float64Array(2048);
  private initX: Float64Array = new Float64Array(2048);
  private initY: Float64Array = new Float64Array(2048);
  private radius: Float32Array = new Float32Array(2048);
  private invMass: Float32Array = new Float32Array(2048);
  private isPhasing: Uint8Array = new Uint8Array(2048);
  private velX: Float32Array = new Float32Array(2048);
  private velY: Float32Array = new Float32Array(2048);
  private hasVel: Uint8Array = new Uint8Array(2048);
  private curApplyVelocityNudges: boolean = false;
  private curRestitution: number = 0.0;
  private curVelocityNudgeFactor: number = 0.0;
  private curMaxVelocityNudge: number = 250.0;

  // Scratch arrays for zero-GC active entity caching
  private scratchActive: SeparableEntity[] = [];

  // Scratch stats to eliminate per-call heap allocation in 60 FPS loop
  private readonly scratchStats: SpatialSeparationStats = {
    entitiesProcessed: 0,
    pairsChecked: 0,
    overlapsResolved: 0,
    zeroDistancesHandled: 0,
    nanGuardsTriggered: 0,
    velocityNudgesApplied: 0,
    restitutionImpulsesApplied: 0,
    durationMs: 0,
  };

  constructor(cellSize: number = 40, width: number = 800, height: number = 800) {
    this.reconfigure(cellSize, width, height);
  }

  public reconfigure(cellSize: number, width: number, height: number): void {
    this.cellSize = Math.max(16, cellSize);
    this.cols = Math.max(1, Math.ceil(width / this.cellSize));
    this.rows = Math.max(1, Math.ceil(height / this.cellSize));
    this.numCells = this.cols * this.rows;

    if (this.cellHead.length < this.numCells) {
      this.cellHead = new Int32Array(Math.max(this.numCells, this.cellHead.length * 2, 1024));
    }
  }

  private ensureEntityCapacity(count: number): void {
    if (this.entityNext.length < count) {
      const newCap = Math.max(count, this.entityNext.length * 2, 2048);
      this.entityNext = new Int32Array(newCap);
      this.posX = new Float64Array(newCap);
      this.posY = new Float64Array(newCap);
      this.initX = new Float64Array(newCap);
      this.initY = new Float64Array(newCap);
      this.radius = new Float32Array(newCap);
      this.invMass = new Float32Array(newCap);
      this.isPhasing = new Uint8Array(newCap);
      this.velX = new Float32Array(newCap);
      this.velY = new Float32Array(newCap);
      this.hasVel = new Uint8Array(newCap);
    }
  }

  public clear(): void {
    const len = Math.min(this.numCells, this.cellHead.length);
    this.cellHead.fill(-1, 0, len);
  }

  public insert(entityIndex: number, x: number, y: number): void {
    if (
      typeof entityIndex !== 'number' ||
      !Number.isFinite(entityIndex) ||
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return;
    }
    const eIdx = entityIndex | 0;
    if (eIdx < 0) return;
    this.ensureEntityCapacity(eIdx + 1);
    if (eIdx >= this.entityNext.length) return;

    const col = Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize)));
    const cellIdx = (row * this.cols + col) | 0;
    if (cellIdx < 0 || cellIdx >= this.cellHead.length) return;

    this.entityNext[eIdx] = this.cellHead[cellIdx];
    this.cellHead[cellIdx] = eIdx;
  }

  /**
   * Resolves physical overlaps and spatial separation across all active entities.
   */
  public resolveSeparation(
    entities: SeparableEntity[],
    options: SpatialSeparationOptions = {}
  ): SpatialSeparationStats {
    const startTs = Date.now();

    const iterations = Math.max(1, options.iterations ?? 2);
    const separationFactor = Math.min(1.0, Math.max(0.05, options.separationFactor ?? 0.5));
    const defaultRadius = options.defaultRadius ?? 12;
    const defaultMass = options.defaultMass ?? 1.0;
    const bounds = options.bounds;
    const walls = options.walls;
    const map = options.map;
    const tileSize = options.tileSize ?? 40;
    const restitution = Math.max(0.0, Math.min(1.0, options.restitution ?? 0.0));
    const velocityNudgeFactor = Math.max(0.0, Math.min(10.0, options.velocityNudgeFactor ?? (options.applyVelocityNudges ? 0.2 : 0.0)));
    const maxVelocityNudge = Math.max(10.0, options.maxVelocityNudge ?? 250.0);
    const applyVelocityNudges = options.applyVelocityNudges ?? (restitution > 0 || velocityNudgeFactor > 0);

    this.curRestitution = restitution;
    this.curVelocityNudgeFactor = velocityNudgeFactor;
    this.curMaxVelocityNudge = maxVelocityNudge;
    this.curApplyVelocityNudges = applyVelocityNudges;

    // Dynamic grid reconfigure if custom cellSize or bounds exceed current grid geometry
    const targetCellSize = options.cellSize ?? this.cellSize;
    const targetWidth = bounds ? Math.max(bounds.maxX, 800) : 800;
    const targetHeight = bounds ? Math.max(bounds.maxY, 800) : 800;
    if (
      targetCellSize !== this.cellSize ||
      targetWidth > this.cols * this.cellSize ||
      targetHeight > this.rows * this.cellSize
    ) {
      this.reconfigure(targetCellSize, targetWidth, targetHeight);
    }

    const stats = this.scratchStats;
    stats.entitiesProcessed = 0;
    stats.pairsChecked = 0;
    stats.overlapsResolved = 0;
    stats.zeroDistancesHandled = 0;
    stats.nanGuardsTriggered = 0;
    stats.velocityNudgesApplied = 0;
    stats.restitutionImpulsesApplied = 0;
    stats.durationMs = 0;

    // Filter active, non-dead entities into scratch list
    this.scratchActive.length = 0;
    for (let k = 0; k < entities.length; k++) {
      const e = entities[k];
      if (e && e.active !== false && !e.isDead) {
        // Enforce finite coordinate guards before processing
        if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) {
          stats.nanGuardsTriggered++;
          e.x = bounds ? (bounds.minX + bounds.maxX) / 2 : 200;
          e.y = bounds ? (bounds.minY + bounds.maxY) / 2 : 200;
        }
        this.scratchActive.push(e);
      }
    }

    const activeList = this.scratchActive;
    const activeCount = activeList.length;
    stats.entitiesProcessed = activeCount;

    if (activeCount < 2) {
      if (activeCount === 1) {
        this.syncPhysicsBody(activeList[0], stats);
      }
      stats.durationMs = Date.now() - startTs;
      return stats;
    }

    this.ensureEntityCapacity(activeCount);

    const posX = this.posX;
    const posY = this.posY;
    const initX = this.initX;
    const initY = this.initY;
    const radius = this.radius;
    const invMass = this.invMass;
    const isPhasing = this.isPhasing;
    const velX = this.velX;
    const velY = this.velY;
    const hasVel = this.hasVel;

    for (let i = 0; i < activeCount; i++) {
      const e = activeList[i];
      posX[i] = e.x;
      posY[i] = e.y;
      initX[i] = e.x;
      initY[i] = e.y;
      radius[i] = (typeof e.collisionRadius === 'number' && Number.isFinite(e.collisionRadius)) ? e.collisionRadius : defaultRadius;
      const m = Math.max(0.01, (typeof e.mass === 'number' && Number.isFinite(e.mass)) ? e.mass : defaultMass);
      invMass[i] = 1.0 / m;
      isPhasing[i] = e.isPhasing ? 1 : 0;

      if (e.body && e.body.velocity) {
        hasVel[i] = 1;
        const vx = e.body.velocity.x;
        const vy = e.body.velocity.y;
        if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
          stats.nanGuardsTriggered++;
          velX[i] = 0;
          velY[i] = 0;
        } else {
          velX[i] = vx;
          velY[i] = vy;
        }
      } else {
        hasVel[i] = 0;
        velX[i] = 0;
        velY[i] = 0;
      }
    }

    const goldenAngle = 2.399963229728653; // Golden angle in radians (~137.508 deg)
    const entityNext = this.entityNext;

    for (let iter = 0; iter < iterations; iter++) {
      this.clear();

      // Populate uniform grid with active entities
      for (let i = 0; i < activeCount; i++) {
        this.insert(i, posX[i], posY[i]);
      }

      // Query adjacent grid cells to test unique entity pairs
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const cellIdx = r * this.cols + c;
          const headA = this.cellHead[cellIdx];
          if (headA === -1) continue;

          // 1. Resolve pairs within the same cell
          for (
            let i = headA, stepA = 0;
            i >= 0 && i < activeCount && i < entityNext.length && stepA < activeCount;
            i = entityNext[i], stepA++
          ) {
            if (isPhasing[i]) continue;

            for (
              let j = entityNext[i], stepB = 0;
              j >= 0 && j < activeCount && j < entityNext.length && stepB < activeCount;
              j = entityNext[j], stepB++
            ) {
              if (isPhasing[j]) continue;

              stats.pairsChecked++;
              this.resolvePairFast(
                i,
                j,
                separationFactor,
                goldenAngle,
                stats
              );
            }
          }

          // 2. Resolve pairs with adjacent neighboring cells: (c+1, r), (c-1, r+1), (c, r+1), (c+1, r+1)
          if (c + 1 < this.cols) {
            const headB = this.cellHead[cellIdx + 1];
            if (headB !== -1) {
              this.resolveCellPair(
                headA,
                headB,
                separationFactor,
                goldenAngle,
                stats,
                activeCount
              );
            }
          }

          if (r + 1 < this.rows) {
            const nextRowBase = cellIdx + this.cols;
            if (c > 0) {
              const headB = this.cellHead[nextRowBase - 1];
              if (headB !== -1) {
                this.resolveCellPair(
                  headA,
                  headB,
                  separationFactor,
                  goldenAngle,
                  stats,
                  activeCount
                );
              }
            }
            const headB_down = this.cellHead[nextRowBase];
            if (headB_down !== -1) {
              this.resolveCellPair(
                headA,
                headB_down,
                separationFactor,
                goldenAngle,
                stats,
                activeCount
              );
            }
            if (c + 1 < this.cols) {
              const headB_dr = this.cellHead[nextRowBase + 1];
              if (headB_dr !== -1) {
                this.resolveCellPair(
                  headA,
                  headB_dr,
                  separationFactor,
                  goldenAngle,
                  stats,
                  activeCount
                );
              }
            }
          }
        }
      }

      // Boundary clamping & static obstacle resolution after each iteration
      for (let i = 0; i < activeCount; i++) {
        const r = radius[i];
        if (bounds) {
          if (posX[i] < bounds.minX) posX[i] = bounds.minX;
          else if (posX[i] > bounds.maxX) posX[i] = bounds.maxX;
          if (posY[i] < bounds.minY) posY[i] = bounds.minY;
          else if (posY[i] > bounds.maxY) posY[i] = bounds.maxY;
        }

        if (walls && walls.length > 0) {
          this.resolveStaticWallsDirect(i, walls, r);
        }

        if (map) {
          this.resolveGridMapWallsDirect(i, map, tileSize, r);
        }
      }
    }

    // RUNAWAY WARPING & EXPLOSIVE IMPULSE DEFENSE:
    // Under extreme entity clustering (e.g. 120+ entities stacked or compressed),
    // clamp cumulative displacement per step to prevent entities exploding outward
    const maxDisplacement = Math.max(8.0, options.maxDisplacement ?? 32.0);
    const maxDispSq = maxDisplacement * maxDisplacement;
    for (let i = 0; i < activeCount; i++) {
      const ddx = posX[i] - initX[i];
      const ddy = posY[i] - initY[i];
      const dDistSq = ddx * ddx + ddy * ddy;
      if (dDistSq > maxDispSq) {
        const scale = maxDisplacement / Math.sqrt(dDistSq);
        posX[i] = initX[i] + ddx * scale;
        posY[i] = initY[i] + ddy * scale;
      }

      const r = radius[i];
      if (bounds) {
        if (posX[i] < bounds.minX) posX[i] = bounds.minX;
        else if (posX[i] > bounds.maxX) posX[i] = bounds.maxX;
        if (posY[i] < bounds.minY) posY[i] = bounds.minY;
        else if (posY[i] > bounds.maxY) posY[i] = bounds.maxY;
      }

      if (walls && walls.length > 0) {
        this.resolveStaticWallsDirect(i, walls, r);
      }

      if (map) {
        this.resolveGridMapWallsDirect(i, map, tileSize, r);
      }
    }

    // Write back final resolved coordinates & velocities, and synchronize Arcade physics body
    for (let i = 0; i < activeCount; i++) {
      const e = activeList[i];
      e.x = posX[i];
      e.y = posY[i];

      if (hasVel[i] && e.body?.velocity) {
        let vx = velX[i];
        let vy = velY[i];
        if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
          stats.nanGuardsTriggered++;
          vx = 0;
          vy = 0;
        } else {
          const MAX_SPEED = 400;
          const speedSq = vx * vx + vy * vy;
          if (speedSq > MAX_SPEED * MAX_SPEED) {
            const scale = MAX_SPEED / Math.sqrt(speedSq);
            vx *= scale;
            vy *= scale;
          }
        }
        e.body.velocity.x = vx;
        e.body.velocity.y = vy;
      }

      this.syncPhysicsBody(e, stats);
    }

    stats.durationMs = Date.now() - startTs;
    return stats;
  }

  private resolveCellPair(
    headA: number,
    headB: number,
    separationFactor: number,
    goldenAngle: number,
    stats: SpatialSeparationStats,
    activeCount: number
  ): void {
    const entityNext = this.entityNext;
    const isPhasing = this.isPhasing;
    for (
      let i = headA, stepA = 0;
      i >= 0 && i < activeCount && i < entityNext.length && stepA < activeCount;
      i = entityNext[i], stepA++
    ) {
      if (isPhasing[i]) continue;

      for (
        let j = headB, stepB = 0;
        j >= 0 && j < activeCount && j < entityNext.length && stepB < activeCount;
        j = entityNext[j], stepB++
      ) {
        if (isPhasing[j]) continue;

        stats.pairsChecked++;
        this.resolvePairFast(i, j, separationFactor, goldenAngle, stats);
      }
    }
  }

  private resolvePairFast(
    i: number,
    j: number,
    separationFactor: number,
    goldenAngle: number,
    stats: SpatialSeparationStats
  ): void {
    if (
      i < 0 ||
      i >= this.posX.length ||
      j < 0 ||
      j >= this.posX.length
    ) {
      return;
    }
    const minDistance = this.radius[i] + this.radius[j];
    const dx = this.posX[j] - this.posX[i];
    const dy = this.posY[j] - this.posY[i];
    const distSq = dx * dx + dy * dy;

    if (distSq >= minDistance * minDistance) {
      return; // No overlap
    }

    stats.overlapsResolved++;

    let nx: number;
    let ny: number;
    let overlap: number;

    // ZERO DIVISION DEFENSE:
    // If entities are co-located at identical coordinates (or distance < 1e-4),
    // calculate a deterministic, non-zero golden spiral dispersion angle.
    if (distSq < 1e-8) {
      stats.zeroDistancesHandled++;
      const angle = (i * goldenAngle + j * 0.785398) % 6.283185307179586;
      nx = Math.cos(angle);
      ny = Math.sin(angle);
      overlap = minDistance;
    } else {
      const dist = Math.sqrt(distSq);
      nx = dx / dist;
      ny = dy / dist;
      overlap = minDistance - dist;
    }

    // Secondary NaN defense
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(overlap)) {
      stats.nanGuardsTriggered++;
      nx = 1.0;
      ny = 0.0;
      overlap = minDistance;
    }

    // Mass-weighted displacement: heavier entities move less
    const invA = this.invMass[i];
    const invB = this.invMass[j];
    const totalInv = invA + invB;
    const ratioA = invA / totalInv;
    const ratioB = invB / totalInv;

    const push = overlap * separationFactor;
    this.posX[i] -= nx * push * ratioA;
    this.posY[i] -= ny * push * ratioA;
    this.posX[j] += nx * push * ratioB;
    this.posY[j] += ny * push * ratioB;

    // Velocity nudges and restitution math (Zero-NaN guarded)
    if (this.curApplyVelocityNudges && (this.hasVel[i] || this.hasVel[j])) {
      const vAx = this.velX[i];
      const vAy = this.velY[i];
      const vBx = this.velX[j];
      const vBy = this.velY[j];

      // Relative velocity: entity B relative to entity A
      const vRelX = vBx - vAx;
      const vRelY = vBy - vAy;
      const vRelNorm = vRelX * nx + vRelY * ny;

      // 1. Restitution impulse (for closing entities: vRelNorm < 0)
      if (vRelNorm < -1e-4 && this.curRestitution >= 0) {
        stats.restitutionImpulsesApplied++;
        const impulseMag = -(1.0 + this.curRestitution) * vRelNorm;

        if (Number.isFinite(impulseMag)) {
          if (this.hasVel[i]) {
            this.velX[i] -= nx * impulseMag * ratioA;
            this.velY[i] -= ny * impulseMag * ratioA;
          }
          if (this.hasVel[j]) {
            this.velX[j] += nx * impulseMag * ratioB;
            this.velY[j] += ny * impulseMag * ratioB;
          }
        } else {
          stats.nanGuardsTriggered++;
        }
      }

      // 2. Outward velocity nudge proportional to overlap penetration
      if (this.curVelocityNudgeFactor > 0 && overlap > 0) {
        stats.velocityNudgesApplied++;
        const rawNudge = overlap * this.curVelocityNudgeFactor;
        const nudgeSpeed = Math.min(rawNudge, this.curMaxVelocityNudge);

        if (Number.isFinite(nudgeSpeed)) {
          if (this.hasVel[i]) {
            this.velX[i] -= nx * nudgeSpeed * ratioA;
            this.velY[i] -= ny * nudgeSpeed * ratioA;
          }
          if (this.hasVel[j]) {
            this.velX[j] += nx * nudgeSpeed * ratioB;
            this.velY[j] += ny * nudgeSpeed * ratioB;
          }
        } else {
          stats.nanGuardsTriggered++;
        }
      }
    }
  }

  private resolveStaticWallsDirect(
    i: number,
    walls: Array<{ x: number; y: number; width: number; height: number }>,
    halfSize: number
  ): void {
    if (i < 0 || i >= this.posX.length) return;
    const left = this.posX[i] - halfSize;
    const right = this.posX[i] + halfSize;
    const top = this.posY[i] - halfSize;
    const bottom = this.posY[i] + halfSize;

    for (let w = 0; w < walls.length; w++) {
      const wall = walls[w];
      const wLeft = wall.x;
      const wRight = wall.x + wall.width;
      const wTop = wall.y;
      const wBottom = wall.y + wall.height;

      if (right <= wLeft || left >= wRight || bottom <= wTop || top >= wBottom) {
        continue;
      }

      const overlapRight = right - wLeft;
      const overlapLeft = wRight - left;
      const overlapBottom = bottom - wTop;
      const overlapTop = wBottom - top;

      const minX = Math.min(overlapRight, overlapLeft);
      const minY = Math.min(overlapBottom, overlapTop);

      if (minX < minY) {
        if (overlapRight < overlapLeft) {
          this.posX[i] -= overlapRight;
        } else {
          this.posX[i] += overlapLeft;
        }
      } else {
        if (overlapBottom < overlapTop) {
          this.posY[i] -= overlapBottom;
        } else {
          this.posY[i] += overlapTop;
        }
      }
    }
  }

  private resolveGridMapWallsDirect(
    i: number,
    map: number[][],
    tileSize: number,
    radius: number
  ): void {
    if (i < 0 || i >= this.posX.length) return;
    const rows = map.length;
    const cols = map[0]?.length ?? 0;
    if (rows === 0 || cols === 0) return;

    const minC = Math.max(0, Math.floor((this.posX[i] - radius) / tileSize));
    const maxC = Math.min(cols - 1, Math.floor((this.posX[i] + radius) / tileSize));
    const minR = Math.max(0, Math.floor((this.posY[i] - radius) / tileSize));
    const maxR = Math.min(rows - 1, Math.floor((this.posY[i] + radius) / tileSize));

    for (let r = minR; r <= maxR; r++) {
      if (!map[r]) continue;
      for (let c = minC; c <= maxC; c++) {
        // Solid wall or unbreakable pillar (TILE_WALL = 1)
        if (map[r][c] === 1) {
          const wLeft = c * tileSize;
          const wRight = wLeft + tileSize;
          const wTop = r * tileSize;
          const wBottom = wTop + tileSize;

          const eLeft = this.posX[i] - radius;
          const eRight = this.posX[i] + radius;
          const eTop = this.posY[i] - radius;
          const eBottom = this.posY[i] + radius;

          if (eRight > wLeft && eLeft < wRight && eBottom > wTop && eTop < wBottom) {
            const overlapR = eRight - wLeft;
            const overlapL = wRight - eLeft;
            const overlapB = eBottom - wTop;
            const overlapT = wBottom - eTop;

            const minX = Math.min(overlapR, overlapL);
            const minY = Math.min(overlapB, overlapT);

            if (minX < minY) {
              this.posX[i] += overlapR < overlapL ? -overlapR : overlapL;
            } else {
              this.posY[i] += overlapB < overlapT ? -overlapB : overlapT;
            }
          }
        }
      }
    }
  }

  private syncPhysicsBody(e: SeparableEntity, stats: SpatialSeparationStats): void {
    // NaN safeguard
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) {
      stats.nanGuardsTriggered++;
      e.x = 200;
      e.y = 200;
    }

    if (e.body) {
      // Runaway velocity and NaN velocity guard
      if (e.body.velocity) {
        const vx = e.body.velocity.x;
        const vy = e.body.velocity.y;
        if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
          stats.nanGuardsTriggered++;
          e.body.velocity.x = 0;
          e.body.velocity.y = 0;
        } else {
          const MAX_VELOCITY = 400;
          const speedSq = vx * vx + vy * vy;
          if (speedSq > MAX_VELOCITY * MAX_VELOCITY) {
            const scale = MAX_VELOCITY / Math.sqrt(speedSq);
            e.body.velocity.x = vx * scale;
            e.body.velocity.y = vy * scale;
          }
        }
      }

      if (typeof e.body.updateFromGameObject === 'function') {
        e.body.updateFromGameObject();
      } else if (e.body.position) {
        const halfW = e.body.halfWidth ?? ((e.body.width ?? 24) / 2);
        const halfH = e.body.halfHeight ?? ((e.body.height ?? 24) / 2);
        e.body.position.x = e.x - halfW;
        e.body.position.y = e.y - halfH;
        if (typeof e.body.updateCenter === 'function') {
          e.body.updateCenter();
        }
      }
    }
  }
}

// Global singleton instance for Zero-GC shared usage
export const defaultSpatialGrid = new SpatialSeparationGrid(40, 800, 800);

/**
 * Functional entrypoint to resolve entity spatial separation and collision resolution.
 */
export function resolveEntitySeparation(
  entities: SeparableEntity[],
  options?: SpatialSeparationOptions
): SpatialSeparationStats {
  return defaultSpatialGrid.resolveSeparation(entities, options);
}
