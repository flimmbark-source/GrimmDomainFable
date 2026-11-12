/**
 * Static map definition shared by the simulation (collision, spawns, patrol
 * routes) and the renderer (where to put which prop). One source of truth:
 * whatever blocks movement here is what the client draws there.
 *
 * Units are metres on the ground plane; +x is east, +z is south (towards the
 * default camera). The world is flat.
 */
import { ORCHARD_VALE } from '../world/orchardVale.ts';
import type { RegionDef } from './region.ts';
import type { TerrainDef } from './terrain.ts';

export type PropKind =
  | 'tree_pine'
  | 'tree_oak'
  | 'tree_dead'
  | 'rock'
  | 'boulder'
  | 'thicket'
  | 'ruin_wall'
  | 'standing_stone'
  | 'crooked_house'
  // --- Settled-valley kit (first used by the Orchard Vale region) ---
  | 'tree_apple'
  | 'tree_apple_old'
  | 'tree_apple_young'
  | 'tree_apple_feral'
  | 'tree_witness'
  | 'tree_oldwood'
  | 'tree_birch'
  | 'tree_willow'
  | 'coppice_stool'
  | 'sapling'
  | 'hedge'
  | 'stone_wall'
  | 'terrace_wall'
  | 'fence'
  | 'ruin_fragment'
  | 'ruin_chimney'
  | 'boundary_stone'
  | 'boundary_stone_fallen'
  | 'cottage_a'
  | 'cottage_b'
  | 'cottage_c'
  | 'longhouse'
  | 'press_house'
  | 'storehouse'
  | 'cart_shed'
  | 'mill'
  | 'barn'
  | 'bridge_parapet'
  | 'well'
  | 'cart'
  | 'barrel_stack'
  | 'crate_stack'
  | 'haystack'
  | 'log_pile'
  | 'cider_press'
  | 'trough'
  | 'signpost'
  | 'beehives'
  // Invisible blockers whose visible form is drawn from other map data.
  | 'water';

export interface CircleCollider {
  shape: 'circle';
  radius: number;
}

export interface BoxCollider {
  shape: 'box';
  /** Half extents of an axis-aligned box. */
  hx: number;
  hz: number;
}

/**
 * Box turned to any angle. (ux, uz) is the unit direction of the box's local
 * x axis; it is derived with sqrt only (never trig), so the simulation stays
 * bit-reproducible.
 */
export interface OrientedBoxCollider {
  shape: 'obox';
  hx: number;
  hz: number;
  ux: number;
  uz: number;
}

export type Collider = CircleCollider | BoxCollider | OrientedBoxCollider;

export interface PropDef {
  kind: PropKind;
  x: number;
  z: number;
  /** Visual yaw in radians (render only; colliders stay axis-aligned). */
  yaw: number;
  /** Visual scale multiplier (the collider below is already final-sized). */
  scale: number;
  collider: Collider;
  /** Does this prop hide what is behind it? The occluder IS the collider:
   *  cover is exactly the solid thing the player sees and bumps into. */
  blocksSight: boolean;
  /** Render only: picks one of a kind's look-alike variants. */
  variant?: number;
}

/** Axis-aligned playable rectangle. */
export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Point {
  x: number;
  z: number;
}

export type MonsterType = 'scout' | 'brute';

export interface MonsterSpawn {
  type: MonsterType;
  /** Dark slot (0-3) that owns this monster: only that seat receives its
   *  live vision and may give it orders (D-012). */
  ownerSlot: number;
  /** Patrol this route (index into patrolRoutes)... */
  route?: number;
  /** ...or stand guard here. */
  post?: Point;
}

const boundsCache = new WeakMap<MapDef, Bounds>();

/** The playable rectangle of any map. */
export function boundsOf(map: MapDef): Bounds {
  let b = boundsCache.get(map);
  if (!b) {
    b = map.bounds ?? { minX: -map.halfSize, maxX: map.halfSize, minZ: -map.halfSize, maxZ: map.halfSize };
    boundsCache.set(map, b);
  }
  return b;
}

/** A place worth crossing the map for. Placeholder objective for M1: the
 *  resource economy itself is M2 and undecided. */
export interface SiteDef {
  id: number;
  x: number;
  z: number;
}

export interface MapDef {
  id: string;
  /** Playable area is [-halfSize, halfSize] on both axes, unless `bounds`
   *  is given (then halfSize is only the largest half extent). */
  halfSize: number;
  /** Playable rectangle. Use boundsOf() rather than reading this directly. */
  bounds?: Bounds;
  /** Ground relief shared by server and client (see terrain.ts). Absent = flat. */
  terrain?: TerrainDef;
  /** Render-only description of the region beyond its colliders (see region.ts). */
  region?: RegionDef;
  props: PropDef[];
  /** Dirt paths, render-only (may run on past the playable area). */
  paths: { width: number; points: Point[] }[];
  /** Spawn point per slot id (length 8). */
  spawns: Point[];
  /** Closed patrol loops for autonomous monsters. */
  patrolRoutes: Point[][];
  monsters: MonsterSpawn[];
  sites: SiteDef[];
  /** Distant scenery anchors (never collidable, outside the playable area). */
  landmarks: { kind: 'castle'; x: number; z: number }[];
}

function tree(kind: PropKind, x: number, z: number, yaw: number, scale: number): PropDef {
  const base = kind === 'tree_oak' ? 0.75 : kind === 'tree_pine' ? 0.55 : 0.45;
  return { kind, x, z, yaw, scale, collider: { shape: 'circle', radius: base * scale }, blocksSight: true };
}

/** Knee-high rock: stops feet, hides nothing. */
function rock(x: number, z: number, yaw: number, scale: number): PropDef {
  return { kind: 'rock', x, z, yaw, scale, collider: { shape: 'circle', radius: 0.9 * scale }, blocksSight: false };
}

/** Rock taller than a hero: solid cover. */
function boulder(x: number, z: number, yaw: number, scale: number): PropDef {
  return { kind: 'boulder', x, z, yaw, scale, collider: { shape: 'circle', radius: 1.5 * scale }, blocksSight: true };
}

/** Dense bramble hedge, axis-aligned: solid cover. */
function thicket(x: number, z: number, hx: number, hz: number): PropDef {
  return { kind: 'thicket', x, z, yaw: 0, scale: 1, collider: { shape: 'box', hx, hz }, blocksSight: true };
}

/** Stretch of ruined wall, axis-aligned: solid cover. */
function ruinWall(x: number, z: number, hx: number, hz: number): PropDef {
  return { kind: 'ruin_wall', x, z, yaw: 0, scale: 1, collider: { shape: 'box', hx, hz }, blocksSight: true };
}

function stone(x: number, z: number, yaw: number, scale: number): PropDef {
  // Imported GLB asset (see public/models): proves the model import path.
  return { kind: 'standing_stone', x, z, yaw, scale, collider: { shape: 'circle', radius: 0.8 * scale }, blocksSight: true };
}

/**
 * M1 hunt-and-escape scene: a forest crossing.
 *
 *   - Two caches, one far west and one far east, both outside the Scout's
 *     normal view. Collecting both means crossing the middle.
 *   - DIRECT route: straight across the open clearing and the road, which the
 *     Scout patrols. Short, exposed, with two standing stones as the only cover.
 *   - SOUTH route: behind a belt of ruined wall, thicket and boulder. Longer,
 *     covered, except for one gap where the road cuts through the belt.
 *   - NORTH route: behind the crooked house and a second belt. Covered from
 *     the road, but it passes the Dark side's spawn.
 *
 * tests/m1-map.test.ts checks these claims against the real geometry.
 */
export const FOREST_CROSSING: MapDef = {
  id: 'forest_crossing_v1',
  halfSize: 30,
  props: [
    { kind: 'crooked_house', x: -9, z: -5, yaw: 0, scale: 1, collider: { shape: 'box', hx: 3.2, hz: 2.6 }, blocksSight: true },

    // Middle of the clearing: thin cover only.
    stone(1.5, 1, 0.35, 1),
    stone(-1.8, -2.6, 2.1, 0.8),
    tree('tree_pine', 6, 4, 0.3, 1.25),
    tree('tree_oak', 12, -4, 1.1, 1.3),
    tree('tree_dead', 2, -9, 2.0, 1.2),
    rock(-8, 9.5, 0.9, 0.7),

    // South belt (covered route runs along z = 15..16, south of these).
    ruinWall(-12.75, 12.5, 3.25, 0.5),
    thicket(-6.25, 13, 3.25, 0.9),
    // ...the road cuts through here: a 5.5 m gap with no cover...
    ruinWall(5.5, 12.8, 3, 0.5),
    boulder(11.5, 12, 0.7, 1),
    thicket(16, 9.5, 1.2, 3),
    rock(4, 17, 0.4, 1.0),

    // North belt (covered route runs along z = -16..-17).
    ruinWall(-2, -13.5, 4, 0.5),
    thicket(9.5, -14, 3, 1),
    boulder(15, -10, 2.2, 0.9),

    // West side, around the west cache.
    tree('tree_pine', -16, 6, 1.7, 1.1),
    tree('tree_pine', -19, 9, 0.2, 1.4),
    tree('tree_dead', -22, -3, 0.7, 1.3),
    rock(-18.5, -2, 1.2, 0.8),
    tree('tree_oak', -18, -14, 0.5, 1.45),
    tree('tree_oak', -12, 18, 0.1, 1.25),

    // East side, around the east cache.
    tree('tree_oak', 22, 2, 1.9, 1.1),
    tree('tree_pine', 20, 12, 2.4, 1.2),
    tree('tree_pine', 21, -12, 0.9, 1.35),
    tree('tree_oak', 15, 18, 2.9, 1.2),

    tree('tree_dead', 9, -19, 2.6, 1.1),
    tree('tree_dead', -4, -20, 1.5, 0.95),
  ],
  paths: [
    // South gate -> clearing centre -> north towards the castle.
    { width: 2.6, points: [{ x: 0, z: 30 }, { x: 1, z: 18 }, { x: -1.5, z: 8 }, { x: -2, z: 2 }, { x: 4, z: -8 }, { x: 5.5, z: -20 }, { x: 4, z: -30 }, { x: 5, z: -60 }, { x: 6, z: -110 }] },
    // Branch to the crooked house door (house front faces +z).
    { width: 1.8, points: [{ x: -2, z: 2 }, { x: -6, z: 0.5 }, { x: -9, z: -1.2 }] },
  ],
  spawns: [
    // Dark slots 0-3: north edge.
    { x: -3, z: -24 }, { x: 0, z: -25 }, { x: 3, z: -24 }, { x: 6, z: -25 },
    // Light slots 4-7: south edge.
    { x: -3, z: 24 }, { x: 0, z: 25 }, { x: 3, z: 24 }, { x: 6, z: 25 },
  ],
  patrolRoutes: [
    // Up and down the road through the middle of the crossing.
    [{ x: -1.5, z: 9 }, { x: -4.5, z: 1.5 }, { x: 4.5, z: -7.5 }, { x: 3.5, z: -1.5 }],
  ],
  monsters: [{ type: 'scout', ownerSlot: 0, route: 0 }],
  sites: [
    { id: 0, x: -21, z: 3 },
    { id: 1, x: 20, z: -2 },
  ],
  landmarks: [{ kind: 'castle', x: 6, z: -230 }],
};

/** Same scene plus a Brute posted in the north, for the alert-response story (M1-07). */
export const FOREST_CROSSING_BRUTE: MapDef = {
  ...FOREST_CROSSING,
  id: 'forest_crossing_v1_brute',
  monsters: [...FOREST_CROSSING.monsters, { type: 'brute', ownerSlot: 1, post: { x: 12, z: -19 } }],
};

const MAPS: Record<string, MapDef> = {
  [FOREST_CROSSING.id]: FOREST_CROSSING,
  [FOREST_CROSSING_BRUTE.id]: FOREST_CROSSING_BRUTE,
  [ORCHARD_VALE.id]: ORCHARD_VALE,
};

export function getMap(id: string): MapDef {
  const map = MAPS[id];
  if (!map) throw new Error(`Unknown map: ${id}`);
  return map;
}

/** Add a map at runtime (tests build small purpose-made arenas). */
export function registerMap(map: MapDef): MapDef {
  MAPS[map.id] = map;
  return map;
}
