/**
 * Deterministic 2D geometry against the shared map: collision queries,
 * walkable-segment tests and line-of-sight occlusion.
 *
 * Only + - * / and Math.sqrt are used on floats (see simulation.ts).
 */
import { boundsOf, type MapDef, type PropDef } from './map.ts';

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function distance(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Squared distance from point (px, pz) to segment a-b. */
function pointSegmentDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((px - ax) * abx + (pz - az) * abz) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t - px;
  const cz = az + abz * t - pz;
  return cx * cx + cz * cz;
}

/** True when segment a-b passes strictly closer than `r` to (cx, cz). */
export function segmentHitsCircle(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, r: number): boolean {
  return pointSegmentDist2(cx, cz, ax, az, bx, bz) < r * r;
}

/** True when segment a-b overlaps the open axis-aligned box (slab test). */
export function segmentHitsBox(
  ax: number, az: number, bx: number, bz: number,
  minX: number, maxX: number, minZ: number, maxZ: number,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  if (dx === 0) {
    if (ax <= minX || ax >= maxX) return false;
  } else {
    let ta = (minX - ax) / dx;
    let tb = (maxX - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 >= t1) return false;
  }
  if (dz === 0) {
    if (az <= minZ || az >= maxZ) return false;
  } else {
    let ta = (minZ - az) / dz;
    let tb = (maxZ - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 >= t1) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Spatial index. Small maps are scanned whole (exactly as before); a map with
// many props gets a bucket grid so a query touches only what is nearby. The
// index is a pure function of the map and lives outside the simulation state.
// ---------------------------------------------------------------------------

/** Maps with at most this many props are scanned linearly. */
const INDEX_MIN_PROPS = 48;
const BUCKET = 8;

interface PropIndex {
  minX: number;
  minZ: number;
  nx: number;
  nz: number;
  buckets: number[][];
  /** Per prop: the query number that last collected it (dedupe). */
  seen: Int32Array;
  query: number;
  scratch: number[];
}

const indexes = new WeakMap<MapDef, PropIndex | null>();

/** Half extents of a prop's axis-aligned bounding box. */
export function propExtent(prop: PropDef): { ex: number; ez: number } {
  const c = prop.collider;
  if (c.shape === 'circle') return { ex: c.radius, ez: c.radius };
  if (c.shape === 'box') return { ex: c.hx, ez: c.hz };
  const ax = c.ux < 0 ? -c.ux : c.ux;
  const az = c.uz < 0 ? -c.uz : c.uz;
  return { ex: ax * c.hx + az * c.hz, ez: az * c.hx + ax * c.hz };
}

function indexFor(map: MapDef): PropIndex | null {
  let index = indexes.get(map);
  if (index !== undefined) return index;
  if (map.props.length <= INDEX_MIN_PROPS) {
    indexes.set(map, null);
    return null;
  }
  const b = boundsOf(map);
  const nx = Math.ceil((b.maxX - b.minX) / BUCKET) + 2;
  const nz = Math.ceil((b.maxZ - b.minZ) / BUCKET) + 2;
  index = {
    minX: b.minX - BUCKET,
    minZ: b.minZ - BUCKET,
    nx,
    nz,
    buckets: Array.from({ length: nx * nz }, () => []),
    seen: new Int32Array(map.props.length).fill(-1),
    query: 0,
    scratch: [],
  };
  map.props.forEach((prop, i) => {
    const { ex, ez } = propExtent(prop);
    const i0 = bucketCoord(index!.minX, nx, prop.x - ex);
    const i1 = bucketCoord(index!.minX, nx, prop.x + ex);
    const j0 = bucketCoord(index!.minZ, nz, prop.z - ez);
    const j1 = bucketCoord(index!.minZ, nz, prop.z + ez);
    for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) index!.buckets[j * nx + k]!.push(i);
  });
  indexes.set(map, index);
  return index;
}

function bucketCoord(origin: number, n: number, v: number): number {
  const i = Math.floor((v - origin) / BUCKET);
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

function collectBox(index: PropIndex, minX: number, maxX: number, minZ: number, maxZ: number): void {
  const i0 = bucketCoord(index.minX, index.nx, minX);
  const i1 = bucketCoord(index.minX, index.nx, maxX);
  const j0 = bucketCoord(index.minZ, index.nz, minZ);
  const j1 = bucketCoord(index.minZ, index.nz, maxZ);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      for (const p of index.buckets[j * index.nx + i]!) {
        if (index.seen[p] === index.query) continue;
        index.seen[p] = index.query;
        index.scratch.push(p);
      }
    }
  }
}

/**
 * Indices of the props that could touch the box, in ascending order (so the
 * order in which colliders are applied never depends on the bucket layout).
 * Returns null for a small map: the caller then scans every prop.
 * The returned array is reused by the next query.
 */
export function propsNearBox(map: MapDef, minX: number, maxX: number, minZ: number, maxZ: number): readonly number[] | null {
  const index = indexFor(map);
  if (!index) return null;
  index.query++;
  index.scratch.length = 0;
  collectBox(index, minX, maxX, minZ, maxZ);
  return index.scratch.sort((a, b) => a - b);
}

/** Like propsNearBox, for a segment swept by `pad`. Order is not guaranteed. */
function propsNearSegment(map: MapDef, ax: number, az: number, bx: number, bz: number, pad: number): readonly number[] | null {
  const index = indexFor(map);
  if (!index) return null;
  index.query++;
  index.scratch.length = 0;
  const dx = bx - ax;
  const dz = bz - az;
  const adx = dx < 0 ? -dx : dx;
  const adz = dz < 0 ? -dz : dz;
  const steps = Math.ceil((adx > adz ? adx : adz) / BUCKET) || 1;
  let px = ax;
  let pz = az;
  for (let s = 1; s <= steps; s++) {
    const qx = ax + (dx * s) / steps;
    const qz = az + (dz * s) / steps;
    collectBox(index, (px < qx ? px : qx) - pad, (px > qx ? px : qx) + pad, (pz < qz ? pz : qz) - pad, (pz > qz ? pz : qz) + pad);
    px = qx;
    pz = qz;
  }
  return index.scratch;
}

/** True when a circle of `radius` at (x, z) overlaps this prop's collider. */
function propBlocksCircle(prop: PropDef, x: number, z: number, radius: number): boolean {
  const eps = 1e-6;
  const c = prop.collider;
  if (c.shape === 'circle') {
    const ox = x - prop.x;
    const oz = z - prop.z;
    const min = radius + c.radius - eps;
    return ox * ox + oz * oz < min * min;
  }
  let lx = x - prop.x;
  let lz = z - prop.z;
  if (c.shape === 'obox') {
    const rx = lx * c.ux + lz * c.uz;
    lz = lz * c.ux - lx * c.uz;
    lx = rx;
  }
  const ox = lx - clamp(lx, -c.hx, c.hx);
  const oz = lz - clamp(lz, -c.hz, c.hz);
  const min = radius - eps;
  return ox * ox + oz * oz < min * min;
}

/** True when segment a-b comes within `radius` of this prop's collider
 *  (boxes are inflated squarely, which is conservative at corners). */
function propHitsSegment(prop: PropDef, ax: number, az: number, bx: number, bz: number, radius: number): boolean {
  const c = prop.collider;
  if (c.shape === 'circle') return segmentHitsCircle(ax, az, bx, bz, prop.x, prop.z, c.radius + radius);
  if (c.shape === 'box') {
    return segmentHitsBox(ax, az, bx, bz, prop.x - c.hx - radius, prop.x + c.hx + radius, prop.z - c.hz - radius, prop.z + c.hz + radius);
  }
  const pax = ax - prop.x;
  const paz = az - prop.z;
  const pbx = bx - prop.x;
  const pbz = bz - prop.z;
  return segmentHitsBox(
    pax * c.ux + paz * c.uz, paz * c.ux - pax * c.uz, pbx * c.ux + pbz * c.uz, pbz * c.ux - pbx * c.uz,
    -c.hx - radius, c.hx + radius, -c.hz - radius, c.hz + radius,
  );
}

function outside(map: MapDef, x: number, z: number, radius: number): boolean {
  const b = boundsOf(map);
  return x > b.maxX - radius || x < b.minX + radius || z > b.maxZ - radius || z < b.minZ + radius;
}

/** True when a circle at (x, z) overlaps any static collider or leaves the map. */
export function isBlocked(map: MapDef, x: number, z: number, radius: number): boolean {
  if (outside(map, x, z, radius)) return true;
  const near = propsNearBox(map, x - radius, x + radius, z - radius, z + radius);
  if (!near) {
    for (const prop of map.props) if (propBlocksCircle(prop, x, z, radius)) return true;
    return false;
  }
  for (const i of near) if (propBlocksCircle(map.props[i]!, x, z, radius)) return true;
  return false;
}

/**
 * Can a circle of `radius` slide along the straight segment a-b without
 * touching a collider? Conservative for boxes (corners are treated as square).
 */
export function segmentWalkable(map: MapDef, ax: number, az: number, bx: number, bz: number, radius: number): boolean {
  if (outside(map, ax, az, radius) || outside(map, bx, bz, radius)) return false;
  const near = propsNearSegment(map, ax, az, bx, bz, radius);
  if (!near) {
    for (const prop of map.props) if (propHitsSegment(prop, ax, az, bx, bz, radius)) return false;
    return true;
  }
  for (const i of near) if (propHitsSegment(map.props[i]!, ax, az, bx, bz, radius)) return false;
  return true;
}

/**
 * Line of sight between two ground points. A prop blocks sight only when the
 * map says so (`blocksSight`), and what blocks sight is exactly the collider
 * the player can see and walk into: no invisible occluders.
 */
export function sightBlocked(map: MapDef, ax: number, az: number, bx: number, bz: number): boolean {
  const near = propsNearSegment(map, ax, az, bx, bz, 0);
  if (!near) {
    for (const prop of map.props) if (prop.blocksSight && propHitsSegment(prop, ax, az, bx, bz, 0)) return true;
    return false;
  }
  for (const i of near) {
    const prop = map.props[i]!;
    if (prop.blocksSight && propHitsSegment(prop, ax, az, bx, bz, 0)) return true;
  }
  return false;
}

/**
 * How much of a round target is visible from an eye point, as a fraction:
 * the centre and both flanks are tested, so a target half behind a tree
 * counts as partly exposed. Range and view arc are the caller's business.
 */
export function exposure(map: MapDef, eyeX: number, eyeZ: number, targetX: number, targetZ: number, targetRadius: number): number {
  const dx = targetX - eyeX;
  const dz = targetZ - eyeZ;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1e-6) return 1;
  // Flank offset, perpendicular to the line of sight.
  const px = (-dz / d) * targetRadius * 0.6;
  const pz = (dx / d) * targetRadius * 0.6;
  let seen = 0;
  if (!sightBlocked(map, eyeX, eyeZ, targetX, targetZ)) seen++;
  if (!sightBlocked(map, eyeX, eyeZ, targetX + px, targetZ + pz)) seen++;
  if (!sightBlocked(map, eyeX, eyeZ, targetX - px, targetZ - pz)) seen++;
  return seen / 3;
}
