/**
 * Deterministic navigation over the shared map: a walkable grid derived from
 * the same colliders the simulation collides with, A* over that grid, and
 * path straightening. Used for every `moveTo`, by bots and by monsters.
 *
 * The grid is a pure function of (map, radius) and is cached outside the
 * simulation state. Costs are integers and ties are broken by insertion
 * order, so the same query always returns the same path on any engine.
 */
import { isBlocked, segmentWalkable } from './geometry.ts';
import type { MapDef, Point } from './map.ts';
import { TUNING } from './tuning.ts';

interface NavGrid {
  /** Cells per side. */
  n: number;
  cell: number;
  /** World coordinate of the grid's low corner. */
  origin: number;
  free: Uint8Array;
}

const grids = new Map<string, NavGrid>();

function gridFor(map: MapDef, radius: number): NavGrid {
  const cell = TUNING.nav.cell;
  const margin = TUNING.nav.gridMargin;
  const key = `${map.id}|${radius}|${cell}|${margin}`;
  let grid = grids.get(key);
  if (grid) return grid;
  const n = Math.ceil((map.halfSize * 2) / cell);
  const free = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -map.halfSize + (i + 0.5) * cell;
      const z = -map.halfSize + (j + 0.5) * cell;
      free[j * n + i] = isBlocked(map, x, z, radius + margin) ? 0 : 1;
    }
  }
  grid = { n, cell, origin: -map.halfSize, free };
  grids.set(key, grid);
  return grid;
}

function cellIndex(grid: NavGrid, v: number): number {
  const i = Math.floor((v - grid.origin) / grid.cell);
  return i < 0 ? 0 : i >= grid.n ? grid.n - 1 : i;
}

function cellCentre(grid: NavGrid, i: number): number {
  return grid.origin + (i + 0.5) * grid.cell;
}

/** Nearest free cell to a world point (the point's own cell when it is free). */
function nearestFreeCell(grid: NavGrid, x: number, z: number): number {
  const ci = cellIndex(grid, x);
  const cj = cellIndex(grid, z);
  if (grid.free[cj * grid.n + ci]) return cj * grid.n + ci;
  let best = -1;
  let bestD = Infinity;
  for (let ring = 1; ring < grid.n; ring++) {
    for (let j = cj - ring; j <= cj + ring; j++) {
      if (j < 0 || j >= grid.n) continue;
      const edgeRow = j === cj - ring || j === cj + ring;
      for (let i = ci - ring; i <= ci + ring; i += edgeRow ? 1 : ring * 2) {
        if (i < 0 || i >= grid.n || !grid.free[j * grid.n + i]) continue;
        const dx = cellCentre(grid, i) - x;
        const dz = cellCentre(grid, j) - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = j * grid.n + i;
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
  return { x: cellCentre(grid, cell % grid.n), z: cellCentre(grid, Math.floor(cell / grid.n)) };
}

// Neighbour offsets and integer step costs (10 straight, 14 diagonal).
const NEIGHBOURS: readonly [number, number, number][] = [
  [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
  [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
];

function astar(grid: NavGrid, start: number, goal: number): number[] | null {
  const n = grid.n;
  const g = new Int32Array(n * n).fill(-1);
  const parent = new Int32Array(n * n).fill(-1);
  const closed = new Uint8Array(n * n);
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

  g[start] = 0;
  push(start, h(start));
  while (heapF.length > 0) {
    const cell = pop();
    if (closed[cell]) continue;
    if (cell === goal) {
      const path: number[] = [];
      for (let c = goal; c !== -1; c = parent[c]!) path.push(c);
      return path.reverse();
    }
    closed[cell] = 1;
    const ci = cell % n;
    const cj = Math.floor(cell / n);
    for (const [di, dj, cost] of NEIGHBOURS) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const next = nj * n + ni;
      if (!grid.free[next] || closed[next]) continue;
      // No corner cutting: a diagonal needs both of its straight neighbours.
      if (di !== 0 && dj !== 0 && (!grid.free[cj * n + ni] || !grid.free[nj * n + ci])) continue;
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
  for (const cell of cells) points.push({ x: cellCentre(grid, cell % grid.n), z: cellCentre(grid, Math.floor(cell / grid.n)) });
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
