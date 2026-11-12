/**
 * Ground relief, shared by the server and the client.
 *
 * A map's terrain is plain data (a list of features). surfaceHeight() is the
 * ONE function that turns it into a height: the client builds its ground mesh
 * from it and stands every actor and prop on it, and the tests check it
 * against the colliders. There is no second, client-only height field inside
 * the playable area.
 *
 * What height does and does not do (honest scope): movement, navigation and
 * line of sight are still 2D. Height never speeds, slows or hides anyone.
 * The contract that keeps this truthful is checked by tests/region tests:
 * every place an actor can stand has a gentle grade, and every steep face
 * (terrace wall, river bank) lies under a collider. So nothing that is drawn
 * as walkable is unwalkable, and nothing drawn as a cliff can be walked.
 *
 * Only + - * / and Math.sqrt are used on floats, like the rest of the sim.
 */
import type { MapDef, Point } from './map.ts';

/** Height added in proportion to distance past a line, between two limits. */
export interface SlopeFeature {
  type: 'slope';
  /** A point on the zero line, and the unit direction of "uphill". */
  x: number;
  z: number;
  ux: number;
  uz: number;
  /** Metres of height per metre travelled uphill. */
  grade: number;
  /** The rise is clamped to [0, maxRise]. */
  maxRise: number;
}

/** Smooth round bump (or hollow, with a negative height). */
export interface SwellFeature {
  type: 'swell';
  x: number;
  z: number;
  radius: number;
  height: number;
}

/** Gentle undulation so that fields are not billiard tables. */
export interface NoiseFeature {
  type: 'noise';
  /** Size of one undulation in metres. */
  scale: number;
  amplitude: number;
  seed: number;
}

/**
 * A step in the ground along a straight line: the "left" side (looking from
 * a to b) is `rise` metres higher. The face is steep except at ramps, where
 * it is spread out into a walkable grade.
 */
export interface TerraceFeature {
  type: 'terrace';
  a: Point;
  b: Point;
  rise: number;
  /** Half width of the steep face. */
  face: number;
  /** The step fades out over this distance at both ends of the line. */
  endFade: number;
  /** Distance along the line from a, half width of the walkable opening.
   *  The change from steep face to ramp is abrupt (half a metre): a ramp is
   *  a cutting through the terrace with a retaining cheek wall on each side. */
  ramps: { at: number; halfWidth: number }[];
  /** Half width of the slope at the centre of a ramp. */
  rampRun: number;
}

/** A channel cut along a polyline: the river bed. */
export interface ChannelFeature {
  type: 'channel';
  points: Point[];
  /** Half width of the water. */
  halfWidth: number;
  /** Width of the bank outside the water. */
  bank: number;
  bedY: number;
  waterY: number;
  /** Shallow crossings: the bed is raised to just under the water for
   *  `halfLength` either side of the distance `along` the polyline. (x, z) is
   *  the same place as a point, for humans and tools. */
  fords: { x: number; z: number; along: number; halfLength: number }[];
}

/** A raised walking surface over whatever is below it: a bridge deck. */
export interface DeckFeature {
  type: 'deck';
  x: number;
  z: number;
  /** Unit direction of travel across the deck. */
  ux: number;
  uz: number;
  /** Half length along the direction of travel, half width across it. */
  hx: number;
  hz: number;
  /** Height at the two ends, and how much higher the crown is. */
  baseY: number;
  rise: number;
}

export type TerrainFeature = SlopeFeature | SwellFeature | NoiseFeature | TerraceFeature | ChannelFeature | DeckFeature;

export interface TerrainDef {
  features: TerrainFeature[];
  /** Steepest grade an actor may be asked to stand on (rise over run). */
  maxWalkableGrade: number;
}

function smooth01(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** 0 below `lo`, 1 above `hi`, smooth in between. */
export function smoothstep(lo: number, hi: number, v: number): number {
  return smooth01((v - lo) / (hi - lo));
}

function hashCell(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1): deterministic on every engine. */
export function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const u = smooth01(x - x0);
  const v = smooth01(z - z0);
  const a = hashCell(x0, z0, seed);
  const b = hashCell(x0 + 1, z0, seed);
  const c = hashCell(x0, z0 + 1, seed);
  const d = hashCell(x0 + 1, z0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Distance from a point to a polyline, and how far along it the nearest point is. */
export function polylineNearest(points: readonly Point[], x: number, z: number): { dist: number; along: number } {
  let best = Infinity;
  let bestAlong = 0;
  let run = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    const len = Math.sqrt(len2);
    let t = len2 > 0 ? ((x - a.x) * abx + (z - a.z) * abz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = a.x + abx * t - x;
    const dz = a.z + abz * t - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) {
      best = d2;
      bestAlong = run + len * t;
    }
    run += len;
  }
  return { dist: Math.sqrt(best), along: bestAlong };
}

/** Half width of a terrace's slope at a distance along its line. */
export function terraceRun(f: TerraceFeature, along: number): number {
  let open = 0;
  for (const ramp of f.ramps) {
    const d = along > ramp.at ? along - ramp.at : ramp.at - along;
    const k = 1 - smoothstep(ramp.halfWidth, ramp.halfWidth + 0.5, d);
    if (k > open) open = k;
  }
  return f.face + (f.rampRun - f.face) * open;
}

/** How much of a terrace's rise applies at a distance along its line (0 past the ends). */
export function terraceStrength(f: TerraceFeature, along: number, length: number): number {
  return smoothstep(0, f.endFade, along) * smoothstep(0, f.endFade, length - along);
}

function terraceHeight(f: TerraceFeature, x: number, z: number): number {
  const abx = f.b.x - f.a.x;
  const abz = f.b.z - f.a.z;
  const length = Math.sqrt(abx * abx + abz * abz);
  const ux = abx / length;
  const uz = abz / length;
  const along = (x - f.a.x) * ux + (z - f.a.z) * uz;
  const strength = terraceStrength(f, along, length);
  if (strength <= 0) return 0;
  // Signed distance: positive on the left of a -> b.
  const side = (x - f.a.x) * uz - (z - f.a.z) * ux;
  const run = terraceRun(f, along);
  return f.rise * strength * smoothstep(-run, run, side);
}

/** How ford-like the channel is here: 1 on a ford, 0 away from every ford. */
function fordFactor(f: ChannelFeature, along: number): number {
  let k = 0;
  for (const ford of f.fords) {
    const d = along > ford.along ? along - ford.along : ford.along - along;
    const v = 1 - smoothstep(ford.halfLength, ford.halfLength + 7, d);
    if (v > k) k = v;
  }
  return k;
}

function deckHeight(f: DeckFeature, x: number, z: number): number | null {
  const ox = x - f.x;
  const oz = z - f.z;
  const lx = ox * f.ux + oz * f.uz;
  const lz = oz * f.ux - ox * f.uz;
  if (lx < -f.hx || lx > f.hx || lz < -f.hz || lz > f.hz) return null;
  const u = lx / f.hx;
  const k = 1 - u * u;
  return f.baseY + f.rise * k * k;
}

/** Height of the bare ground, ignoring bridge decks. */
export function groundHeight(terrain: TerrainDef | undefined, x: number, z: number): number {
  if (!terrain) return 0;
  let h = 0;
  for (const f of terrain.features) {
    if (f.type === 'slope') {
      const d = ((x - f.x) * f.ux + (z - f.z) * f.uz) * f.grade;
      h += d < 0 ? 0 : d > f.maxRise ? f.maxRise : d;
    } else if (f.type === 'swell') {
      const dx = x - f.x;
      const dz = z - f.z;
      const t = 1 - (dx * dx + dz * dz) / (f.radius * f.radius);
      if (t > 0) h += f.height * t * t;
    } else if (f.type === 'noise') {
      h += (valueNoise(x / f.scale, z / f.scale, f.seed) - 0.5) * 2 * f.amplitude;
    } else if (f.type === 'terrace') {
      h += terraceHeight(f, x, z);
    }
  }
  // Channels are cut last, into whatever the other features built.
  for (const f of terrain.features) {
    if (f.type !== 'channel') continue;
    const { dist, along } = polylineNearest(f.points, x, z);
    const ford = fordFactor(f, along);
    const bank = f.bank * (1 + 1.6 * ford);
    if (dist >= f.halfWidth + bank) continue;
    const bed = f.bedY + (f.waterY - 0.14 - f.bedY) * ford;
    const keep = smoothstep(f.halfWidth * 0.55, f.halfWidth + bank, dist);
    h = bed + (h - bed) * keep;
  }
  return h;
}

/** Height of the surface an actor stands on at (x, z): ground or bridge deck. */
export function surfaceHeight(map: MapDef, x: number, z: number): number {
  const terrain = map.terrain;
  if (!terrain) return 0;
  let h = groundHeight(terrain, x, z);
  for (const f of terrain.features) {
    if (f.type !== 'deck') continue;
    const d = deckHeight(f, x, z);
    if (d !== null && d > h) h = d;
  }
  return h;
}

/** Level of the water at a point, or null when there is no channel there. */
export function waterLevel(map: MapDef, x: number, z: number): number | null {
  for (const f of map.terrain?.features ?? []) {
    if (f.type === 'channel' && polylineNearest(f.points, x, z).dist < f.halfWidth + f.bank) return f.waterY;
  }
  return null;
}
