/**
 * Deterministic navigation over the shared map: a walkable grid derived from
 * the same colliders the simulation collides with, A* over that grid, and
 * path straightening. Used for every `moveTo`, by bots and by monsters.
 *
 * The grid is a pure function of (map, radius), is built lazily in tiles and
 * is cached outside the simulation state. Costs are integers and ties are broken by insertion
 * order, so the same query always returns the same path on any engine.
 */
import { isBlocked, segmentWalkable } from './geometry.ts';
import { boundsOf, type MapDef, type Point } from './map.ts';
import { TUNING } from './tuning.ts';

/** Cells per side of one lazily built tile. */
const TILE = 32;

/**
 * The walkable grid of one (map, radius). It covers the map's rectangle but
 * is built a tile at a time, the first time a query looks at that tile, so
 * the work done is proportional to the ground actually travelled rather than
 * to the size of the region. Search scratch space is allocated once and
 * reused (stamped per query), so a path request allocates nothing large.
 */
interface NavGrid {
  /** Cells along x and z. */
  nx: number;
  nz: number;
  cell: number;
  /** World coordinates of the grid's low corner. */
  originX: number;
  originZ: number;
  map: MapDef;
  /** Body radius plus the grid margin: what a free cell must have clear. */
  clearance: number;
  tilesX: number;
  tiles: (Uint8Array | undefined)[];
  // A* scratch, valid for a cell only when its stamp equals `query`.
  g: Int32Array;
  parent: Int32Array;
  stamp: Uint32Array;
  closed: Uint32Array;
  query: number;
}

const grids = new WeakMap<MapDef, Map<string, NavGrid>>();

function gridFor(map: MapDef, radius: number): NavGrid {
  const cell = TUNING.nav.cell;
  const margin = TUNING.nav.gridMargin;
  const key = `${radius}|${cell}|${margin}`;
  let perMap = grids.get(map);
  if (!perMap) grids.set(map, (perMap = new Map()));
  let grid = perMap.get(key);
  if (grid) return grid;
  const b = boundsOf(map);
  const nx = Math.ceil((b.maxX - b.minX) / cell);
  const nz = Math.ceil((b.maxZ - b.minZ) / cell);
  const tilesX = Math.ceil(nx / TILE);
  grid = {
    nx, nz, cell, originX: b.minX, originZ: b.minZ, map, clearance: radius + margin,
    tilesX,
    tiles: new Array<Uint8Array | undefined>(tilesX * Math.ceil(nz / TILE)),
    g: new Int32Array(nx * nz),
    parent: new Int32Array(nx * nz),
    stamp: new Uint32Array(nx * nz),
    closed: new Uint32Array(nx * nz),
    query: 0,
  };
  perMap.set(key, grid);
  return grid;
}

function buildTile(grid: NavGrid, ti: number, tj: number): Uint8Array {
  const tile = new Uint8Array(TILE * TILE);
  for (let j = 0; j < TILE; j++) {
    const gj = tj * TILE + j;
    if (gj >= grid.nz) break;
    for (let i = 0; i < TILE; i++) {
      const gi = ti * TILE + i;
      if (gi >= grid.nx) break;
      const x = grid.originX + (gi + 0.5) * grid.cell;
      const z = grid.originZ + (gj + 0.5) * grid.cell;
      tile[j * TILE + i] = isBlocked(grid.map, x, z, grid.clearance) ? 0 : 1;
    }
  }
  return tile;
}

/** Is cell (i, j) free? Both indices must be inside the grid. */
function isFree(grid: NavGrid, i: number, j: number): boolean {
  const ti = (i / TILE) | 0;
  const tj = (j / TILE) | 0;
  const slot = tj * grid.tilesX + ti;
  let tile = grid.tiles[slot];
  if (!tile) grid.tiles[slot] = tile = buildTile(grid, ti, tj);
  return tile[(j - tj * TILE) * TILE + (i - ti * TILE)] === 1;
}

/** How many tiles of a map's walkable grid have been built so far (tests, tools). */
export function navTilesBuilt(map: MapDef, radius: number): { built: number; total: number } {
  const grid = gridFor(map, radius);
  return { built: grid.tiles.reduce((n, t) => n + (t ? 1 : 0), 0), total: grid.tiles.length };
}

function cellIndex(v: number, origin: number, cell: number, n: number): number {
  const i = Math.floor((v - origin) / cell);
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

function centreX(grid: NavGrid, i: number): number {
  return grid.originX + (i + 0.5) * grid.cell;
}

function centreZ(grid: NavGrid, j: number): number {
  return grid.originZ + (j + 0.5) * grid.cell;
}

/** Nearest free cell to a world point (the point's own cell when it is free). */
function nearestFreeCell(grid: NavGrid, x: number, z: number): number {
  const ci = cellIndex(x, grid.originX, grid.cell, grid.nx);
  const cj = cellIndex(z, grid.originZ, grid.cell, grid.nz);
  if (isFree(grid, ci, cj)) return cj * grid.nx + ci;
  let best = -1;
  let bestD = Infinity;
  const rings = grid.nx > grid.nz ? grid.nx : grid.nz;
  for (let ring = 1; ring < rings; ring++) {
    for (let j = cj - ring; j <= cj + ring; j++) {
      if (j < 0 || j >= grid.nz) continue;
      const edgeRow = j === cj - ring || j === cj + ring;
      for (let i = ci - ring; i <= ci + ring; i += edgeRow ? 1 : ring * 2) {
        if (i < 0 || i >= grid.nx || !isFree(grid, i, j)) continue;
        const dx = centreX(grid, i) - x;
        const dz = centreZ(grid, j) - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = j * grid.nx + i;
        }
      }
    }
    // One more ring after the first hit: a diagonal cell of this ring can be
    // farther than a straight cell of the next.
    if (best >= 0 && ring * grid.cell > Math.sqrt(bestD) + grid.cell) break;
  }
  return best;
}

/** Closest standable point to (x, z) for a body of this radius. */
export function nearestWalkable(map: MapDef, radius: number, x: number, z: number): Point | null {
  if (!isBlocked(map, x, z, radius)) return { x, z };
  const grid = gridFor(map, radius);
  const cell = nearestFreeCell(grid, x, z);
  if (cell < 0) return null;
  return { x: centreX(grid, cell % grid.nx), z: centreZ(grid, Math.floor(cell / grid.nx)) };
}

// Neighbour offsets and integer step costs (10 straight, 14 diagonal).
const NEIGHBOURS: readonly [number, number, number][] = [
  [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
  [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
];

function astar(grid: NavGrid, start: number, goal: number): number[] | null {
  const n = grid.nx;
  const nz = grid.nz;
  const { g, parent, stamp, closed } = grid;
  const query = ++grid.query;
  /** First touch of a cell in this query: reset its scratch entries. */
  const touch = (cell: number): void => {
    if (stamp[cell] === query) return;
    stamp[cell] = query;
    g[cell] = -1;
    parent[cell] = -1;
  };
  // Binary heap ordered by (f, insertion sequence).
  const heapF: number[] = [];
  const heapSeq: number[] = [];
  const heapCell: number[] = [];
  let seq = 0;
  const gi = goal % n;
  const gj = Math.floor(goal / n);
  const h = (cell: number): number => {
    const dx = Math.abs((cell % n) - gi);
    const dz = Math.abs(Math.floor(cell / n) - gj);
    return dx > dz ? 10 * dx + 4 * dz : 10 * dz + 4 * dx;
  };
  const less = (a: number, b: number) => heapF[a]! < heapF[b]! || (heapF[a] === heapF[b] && heapSeq[a]! < heapSeq[b]!);
  const swap = (a: number, b: number) => {
    const f = heapF[a]!, s = heapSeq[a]!, c = heapCell[a]!;
    heapF[a] = heapF[b]!; heapSeq[a] = heapSeq[b]!; heapCell[a] = heapCell[b]!;
    heapF[b] = f; heapSeq[b] = s; heapCell[b] = c;
  };
  const push = (cell: number, f: number) => {
    let i = heapF.length;
    heapF.push(f); heapSeq.push(seq++); heapCell.push(cell);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(i, p)) break;
      swap(i, p);
      i = p;
    }
  };
  const pop = (): number => {
    const top = heapCell[0]!;
    const last = heapF.length - 1;
    swap(0, last);
    heapF.pop(); heapSeq.pop(); heapCell.pop();
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < last && less(l, m)) m = l;
      if (r < last && less(r, m)) m = r;
      if (m === i) break;
      swap(i, m);
      i = m;
    }
    return top;
  };

  touch(start);
  g[start] = 0;
  push(start, h(start));
  while (heapF.length > 0) {
    const cell = pop();
    if (closed[cell] === query) continue;
    if (cell === goal) {
      const path: number[] = [];
      for (let c = goal; c !== -1; c = parent[c]!) path.push(c);
      return path.reverse();
    }
    closed[cell] = query;
    const ci = cell % n;
    const cj = Math.floor(cell / n);
    for (const [di, dj, cost] of NEIGHBOURS) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= nz) continue;
      const next = nj * n + ni;
      if (closed[next] === query || !isFree(grid, ni, nj)) continue;
      // No corner cutting: a diagonal needs both of its straight neighbours.
      if (di !== 0 && dj !== 0 && (!isFree(grid, ni, cj) || !isFree(grid, ci, nj))) continue;
      touch(next);
      const cand = g[cell]! + cost;
      if (g[next] !== -1 && cand >= g[next]!) continue;
      g[next] = cand;
      parent[next] = cell;
      push(next, cand + h(next));
    }
  }
  return null;
}

/**
 * Waypoints from `from` to (as close as possible to) `to`, not including
 * `from` itself. A blocked destination is replaced by the nearest standable
 * point. Returns null only when no route exists at all.
 */
export function findPath(map: MapDef, radius: number, from: Point, to: Point): Point[] | null {
  const goal = nearestWalkable(map, radius, to.x, to.z);
  if (!goal) return null;
  const clear = radius + TUNING.nav.smoothMargin;
  if (segmentWalkable(map, from.x, from.z, goal.x, goal.z, clear)) return [goal];

  const grid = gridFor(map, radius);
  const startCell = nearestFreeCell(grid, from.x, from.z);
  const goalCell = nearestFreeCell(grid, goal.x, goal.z);
  if (startCell < 0 || goalCell < 0) return null;
  const cells = astar(grid, startCell, goalCell);
  if (!cells) return null;

  const points: Point[] = [from];
  for (const cell of cells) points.push({ x: centreX(grid, cell % grid.nx), z: centreZ(grid, Math.floor(cell / grid.nx)) });
  points.push(goal);

  // String pulling: from each kept point, jump to the farthest later point
  // that can be reached in a straight line.
  const out: Point[] = [];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    const a = points[i]!;
    while (j > i + 1) {
      const b = points[j]!;
      if (segmentWalkable(map, a.x, a.z, b.x, b.z, clear)) break;
      j--;
    }
    out.push(points[j]!);
    i = j;
  }
  return out;
}

/** Total length of a path starting at `from`. */
export function pathLength(from: Point, path: readonly Point[]): number {
  let total = 0;
  let px = from.x;
  let pz = from.z;
  for (const p of path) {
    const dx = p.x - px;
    const dz = p.z - pz;
    total += Math.sqrt(dx * dx + dz * dz);
    px = p.x;
    pz = p.z;
  }
  return total;
}
