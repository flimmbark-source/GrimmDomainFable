/**
 * Deterministic 2D geometry against the shared map: collision queries,
 * walkable-segment tests and line-of-sight occlusion.
 *
 * Only + - * / and Math.sqrt are used on floats (see simulation.ts).
 */
import type { MapDef } from './map.ts';

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

/** True when a circle at (x, z) overlaps any static collider or leaves the map. */
export function isBlocked(map: MapDef, x: number, z: number, radius: number): boolean {
  if (Math.abs(x) > map.halfSize - radius || Math.abs(z) > map.halfSize - radius) return true;
  const eps = 1e-6;
  for (const prop of map.props) {
    const c = prop.collider;
    if (c.shape === 'circle') {
      const ox = x - prop.x;
      const oz = z - prop.z;
      const min = radius + c.radius - eps;
      if (ox * ox + oz * oz < min * min) return true;
    } else {
      const ox = x - clamp(x, prop.x - c.hx, prop.x + c.hx);
      const oz = z - clamp(z, prop.z - c.hz, prop.z + c.hz);
      const min = radius - eps;
      if (ox * ox + oz * oz < min * min) return true;
    }
  }
  return false;
}

/**
 * Can a circle of `radius` slide along the straight segment a-b without
 * touching a collider? Conservative for boxes (corners are treated as square).
 */
export function segmentWalkable(map: MapDef, ax: number, az: number, bx: number, bz: number, radius: number): boolean {
  const limit = map.halfSize - radius;
  if (Math.abs(ax) > limit || Math.abs(az) > limit || Math.abs(bx) > limit || Math.abs(bz) > limit) return false;
  for (const prop of map.props) {
    const c = prop.collider;
    if (c.shape === 'circle') {
      if (segmentHitsCircle(ax, az, bx, bz, prop.x, prop.z, c.radius + radius)) return false;
    } else if (
      segmentHitsBox(ax, az, bx, bz, prop.x - c.hx - radius, prop.x + c.hx + radius, prop.z - c.hz - radius, prop.z + c.hz + radius)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Line of sight between two ground points. A prop blocks sight only when the
 * map says so (`blocksSight`), and what blocks sight is exactly the collider
 * the player can see and walk into: no invisible occluders.
 */
export function sightBlocked(map: MapDef, ax: number, az: number, bx: number, bz: number): boolean {
  for (const prop of map.props) {
    if (!prop.blocksSight) continue;
    const c = prop.collider;
    if (c.shape === 'circle') {
      if (segmentHitsCircle(ax, az, bx, bz, prop.x, prop.z, c.radius)) return true;
    } else if (segmentHitsBox(ax, az, bx, bz, prop.x - c.hx, prop.x + c.hx, prop.z - c.hz, prop.z + c.hz)) {
      return true;
    }
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
