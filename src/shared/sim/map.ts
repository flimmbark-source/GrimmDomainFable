/**
 * Static map definition shared by the simulation (collision, spawns, patrol
 * routes) and the renderer (where to put which prop). One source of truth:
 * whatever blocks movement here is what the client draws there.
 *
 * Units are metres on the ground plane; +x is east, +z is south (towards the
 * default camera). The world is flat for M0.
 */

export type PropKind =
  | 'tree_pine'
  | 'tree_oak'
  | 'tree_dead'
  | 'rock'
  | 'standing_stone'
  | 'crooked_house';

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

export interface PropDef {
  kind: PropKind;
  x: number;
  z: number;
  /** Visual yaw in radians (render only; colliders stay axis-aligned). */
  yaw: number;
  /** Visual scale multiplier (the collider below is already final-sized). */
  scale: number;
  collider: CircleCollider | BoxCollider;
}

export interface Point {
  x: number;
  z: number;
}

export interface MapDef {
  id: string;
  /** Playable area is [-halfSize, halfSize] on both axes. */
  halfSize: number;
  props: PropDef[];
  /** Dirt paths, render-only for now (may run on past the playable area). */
  paths: { width: number; points: Point[] }[];
  /** Spawn point per slot id (length 8). */
  spawns: Point[];
  /** Closed patrol loops for autonomous monsters. */
  patrolRoutes: Point[][];
  /** Distant scenery anchors (never collidable, outside the playable area). */
  landmarks: { kind: 'castle'; x: number; z: number }[];
}

function tree(kind: PropKind, x: number, z: number, yaw: number, scale: number): PropDef {
  const base = kind === 'tree_oak' ? 0.75 : kind === 'tree_pine' ? 0.55 : 0.45;
  return { kind, x, z, yaw, scale, collider: { shape: 'circle', radius: base * scale } };
}

function rock(x: number, z: number, yaw: number, scale: number): PropDef {
  return { kind: 'rock', x, z, yaw, scale, collider: { shape: 'circle', radius: 0.9 * scale } };
}

export const FOREST_CLEARING: MapDef = {
  id: 'forest_clearing_v0',
  halfSize: 30,
  props: [
    { kind: 'crooked_house', x: -9, z: -5, yaw: 0, scale: 1, collider: { shape: 'box', hx: 3.2, hz: 2.6 } },

    // The three tree species, placed where they are easy to compare.
    tree('tree_pine', 6, 4, 0.3, 1.25),
    tree('tree_oak', 12, -4, 1.1, 1.3),
    tree('tree_dead', 2, -9, 2.0, 1.2),

    tree('tree_pine', -16, 6, 1.7, 1.1),
    tree('tree_pine', -19, 9, 0.2, 1.4),
    tree('tree_pine', 18, 10, 2.4, 1.2),
    tree('tree_pine', 21, -12, 0.9, 1.35),
    tree('tree_pine', -4, 14, 1.3, 1.0),
    tree('tree_oak', -18, -14, 0.5, 1.45),
    tree('tree_oak', 15, 17, 2.9, 1.2),
    tree('tree_oak', -12, 18, 0.1, 1.25),
    tree('tree_oak', 22, 2, 1.9, 1.1),
    tree('tree_dead', -22, -3, 0.7, 1.3),
    tree('tree_dead', 9, -18, 2.6, 1.1),
    tree('tree_dead', -3, -20, 1.5, 0.95),

    rock(5, 12, 0.4, 1.0),
    rock(-19, -2, 1.2, 0.8),
    rock(16, -9, 2.2, 1.3),
    rock(-8, 10, 0.9, 0.7),

    // Imported GLB asset (see public/models) - proves the model import path.
    { kind: 'standing_stone', x: 1.5, z: 1, yaw: 0.35, scale: 1, collider: { shape: 'circle', radius: 0.8 } },
    { kind: 'standing_stone', x: -1.8, z: -2.6, yaw: 2.1, scale: 0.8, collider: { shape: 'circle', radius: 0.65 } },
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
    [{ x: -4, z: -11 }, { x: 7, z: -3 }, { x: 9, z: 8 }, { x: -2, z: 10 }, { x: -13, z: 3 }, { x: -16, z: -9 }],
  ],
  landmarks: [{ kind: 'castle', x: 6, z: -230 }],
};

const MAPS: Record<string, MapDef> = { [FOREST_CLEARING.id]: FOREST_CLEARING };

export function getMap(id: string): MapDef {
  const map = MAPS[id];
  if (!map) throw new Error(`Unknown map: ${id}`);
  return map;
}
