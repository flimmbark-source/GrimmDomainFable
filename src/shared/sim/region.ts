/**
 * Region description: everything about an authored region that is NOT a
 * collider. The simulation never reads this; the client draws from it and
 * tools/tests use it to name places. Kept as plain data so that a future
 * kingdom generator can emit, move or vary regions without touching the
 * renderer or the simulation.
 *
 * Nothing here is a gameplay rule. `locations` name places for humans and
 * tests; they are not objectives, quest markers or power sources.
 */
import type { Point } from './map.ts';

export type PathKind =
  /** Maintained cart road. */
  | 'road'
  /** Farm or orchard lane. */
  | 'lane'
  /** Narrow walked track (the boundary walk). */
  | 'track'
  /** Abandoned road: old ruts under grass. */
  | 'old_road';

export interface RegionPath {
  kind: PathKind;
  width: number;
  points: Point[];
}

/** Loose, non-colliding dressing placed by hand. Nothing here is taller than
 *  a hero's knee unless it is leaning on a collider, so nothing here looks
 *  like cover. */
export type DressingKind =
  | 'ladder'
  | 'basket'
  | 'apple_pile'
  | 'barrel'
  | 'crate'
  | 'sack'
  | 'bucket'
  | 'bench'
  | 'handcart'
  | 'stepping_stone'
  | 'lantern_post'
  | 'washing_line'
  | 'cart_rut_stone'
  | 'stump'
  | 'grindstone'
  | 'flower_tub'
  | 'chopping_block'
  | 'milestone';

export interface DressingDef {
  kind: DressingKind;
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

/** A planted block of orchard: the renderer mows it, litters it with fruit
 *  and draws the row lines; the trees themselves are ordinary props. */
export interface OrchardPlot {
  /** Corners of the plot, in order. */
  outline: Point[];
  /** Unit direction of the rows. */
  rowUx: number;
  rowUz: number;
  rowSpacing: number;
}

/** A broad patch of distinctive ground, painted by the renderer. */
export interface GroundPatch {
  kind: 'village_yard' | 'meadow' | 'oldwood_floor' | 'hay_field' | 'coppice_floor' | 'garden' | 'cobbles';
  x: number;
  z: number;
  radius: number;
  /** Optional second focus: the patch becomes a capsule between the two. */
  x2?: number;
  z2?: number;
}

/** A named place. For orientation, tests and future generator metadata only. */
export interface LocationDef {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
  /** Free-form tags a future system may read ('settlement', 'crossing', ...). */
  tags: string[];
}

/** Where this region meets the rest of the kingdom. In this build a connector
 *  is only a marked point on the edge; nothing lies beyond it yet. */
export interface ConnectorDef {
  id: string;
  x: number;
  z: number;
  /** Unit direction pointing out of the region. */
  outX: number;
  outZ: number;
  kind: 'road' | 'lane' | 'trail';
  /** What a kingdom generator should attach here (description only). */
  toward: string;
}

/** A point that emits chimney smoke (render only). */
export interface SmokeSource {
  x: number;
  z: number;
  /** Height above the ground. */
  y: number;
}

/** A rotating wheel (render only). */
export interface WheelDef {
  x: number;
  z: number;
  /** Axle height above the water. */
  y: number;
  radius: number;
  width: number;
  /** Unit direction of the axle. */
  axleX: number;
  axleZ: number;
}

export interface RegionDef {
  /** Which look to render with (sky, light, palette). */
  environment: 'orchard_vale';
  paths: RegionPath[];
  plots: OrchardPlot[];
  patches: GroundPatch[];
  dressing: DressingDef[];
  locations: LocationDef[];
  connectors: ConnectorDef[];
  smoke: SmokeSource[];
  wheels: WheelDef[];
}
