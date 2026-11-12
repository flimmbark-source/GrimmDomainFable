/**
 * ORCHARD VALE - authored regional slice (region prototype 01).
 *
 * STATUS: candidate creative direction, not canon. The place and its boundary
 * folklore come from docs/design/region-prototype-orchard-vale.md (folklore
 * revision 3), which is explicitly unapproved. This file builds a PLACE:
 * ground, water, buildings, trees, walls and paths. It adds no mechanics.
 * The witness trees, boundary stones and the ruin are ordinary scenery with
 * ordinary colliders; nothing here is a shrine, a Dark source, a quest or a
 * spirit.
 *
 * Layout, looking north from the default camera (+x east, +z south):
 *
 *   north edge   OLDWOOD ......... ruin (old road) ....... castle road -> N
 *                boundary walk: witness trees + marker stones
 *                north orchard | bent lane | barn | hay meadow | coppice
 *   -------------- RIVER (west -> east): ford ... STONE BRIDGE ... mill ----
 *                water meadow | VILLAGE + press yard | east road -> mill
 *                terrace 1: orchard rows (hedge above the village)
 *   south edge   terrace 2: upper orchard
 *
 * Routes that matter for play:
 *   - The cart road: west gate -> village square -> stone bridge -> junction
 *     -> castle road. Fast, open, and the Scout's beat.
 *   - The ford: a farm lane between hedges crosses the river 67 m upstream
 *     and reaches the north orchard and the boundary walk without touching
 *     the road.
 *   - The terraces: behind the village, above a hedge, from the press yard
 *     round to the mill.
 * tests/orchard-vale.test.ts measures these claims on the real geometry.
 *
 * Coordinates are local to the region. Nothing outside this file depends on
 * them: a kingdom generator can offset, mirror or re-author the layout and
 * every system reads only the resulting MapDef.
 */
import type { Bounds, MapDef, Point } from '../sim/map.ts';
import type { ConnectorDef, GroundPatch, LocationDef, SmokeSource, WheelDef } from '../sim/region.ts';
import type { ChannelFeature, DeckFeature, TerraceFeature, TerrainDef } from '../sim/terrain.ts';
import { FOOTPRINTS, RegionBuilder, alongPolyline, yawFacing, type BuildingKind } from './kit.ts';

const BOUNDS: Bounds = { minX: -92, maxX: 92, minZ: -66, maxZ: 66 };
const MAX_GRADE = 0.25;

// --- Water ------------------------------------------------------------------

const RIVER_POINTS: Point[] = [
  { x: -150, z: -34 }, { x: -104, z: -25 }, { x: -78, z: -15 }, { x: -56, z: -8 }, { x: -36, z: -5 },
  { x: -22, z: -7 }, { x: -10, z: -11 }, { x: 10, z: -11 }, { x: 24, z: -9 }, { x: 40, z: -3 },
  { x: 56, z: 1.5 }, { x: 70, z: 0.5 }, { x: 84, z: -5 }, { x: 104, z: -12 }, { x: 150, z: -18 },
];
/** The ford is on the straight reach between the third and fourth river points. */
const FORD_POINT = { x: -67, z: -11.5 };
/** Unit direction across the river at the ford, pointing to the south bank. */
const FORD_ACROSS = { x: -0.3032, z: 0.9529 };
const BRIDGE = { x: 0, z: -11 };

const RIVER: ChannelFeature = {
  type: 'channel',
  points: RIVER_POINTS,
  halfWidth: 4.5,
  bank: 2.2,
  bedY: -1.5,
  waterY: -0.75,
  fords: [{ ...FORD_POINT, along: alongPolyline(RIVER_POINTS, FORD_POINT.x, FORD_POINT.z), halfLength: 4.5 }],
};
const FORD = RIVER.fords[0]!;
const RIVER_BLOCK = 6.2;

const DECK: DeckFeature = { type: 'deck', x: BRIDGE.x, z: BRIDGE.z, ux: 0, uz: 1, hx: 9.5, hz: 2.3, baseY: -0.35, rise: 1.3 };

// --- Terraces (south side: the left of a -> b is uphill, to the south) ---------

const TERRACE_1: TerraceFeature = {
  type: 'terrace', a: { x: 74, z: 28.5 }, b: { x: -76, z: 32.5 }, rise: 1.1, face: 0.45, endFade: 12, rampRun: 5,
  ramps: [{ at: 30, halfWidth: 2.4 }, { at: 71, halfWidth: 2.4 }, { at: 120, halfWidth: 2.4 }],
};
const TERRACE_2: TerraceFeature = {
  type: 'terrace', a: { x: 68, z: 45.5 }, b: { x: -68, z: 46.5 }, rise: 1.1, face: 0.45, endFade: 12, rampRun: 5,
  ramps: [{ at: 32, halfWidth: 2.4 }, { at: 66, halfWidth: 2.4 }, { at: 98, halfWidth: 2.4 }],
};

const WITNESS_A = { x: -20, z: -26.5 }; // the tree the lane bends round
const WITNESS_B = { x: -52, z: -37.5 }; // the tree the orchard rows leave room for
const RUIN = { x: -44, z: -55 };
const WHEEL: WheelDef = { x: 60, z: 6.3, y: 1.95, radius: 2.6, width: 1.3, axleX: 0, axleZ: 1 };

const TERRAIN: TerrainDef = {
  maxWalkableGrade: MAX_GRADE,
  features: [
    // The valley: both banks climb gently away from the river.
    { type: 'slope', x: 0, z: -2, ux: 0, uz: 1, grade: 0.028, maxRise: 1.0 },
    { type: 'slope', x: 0, z: -19, ux: 0, uz: -1, grade: 0.03, maxRise: 1.4 },
    { type: 'noise', scale: 26, amplitude: 0.28, seed: 11 },
    { type: 'noise', scale: 9, amplitude: 0.06, seed: 5 },
    { type: 'swell', x: WITNESS_A.x, z: WITNESS_A.z, radius: 7, height: 0.55 },
    { type: 'swell', x: WITNESS_B.x, z: WITNESS_B.z, radius: 7, height: 0.45 },
    { type: 'swell', x: RUIN.x, z: RUIN.z, radius: 14, height: 0.9 },
    { type: 'swell', x: 0, z: 11, radius: 16, height: 0.25 },
    // Wheel pit: lets the river reach the mill wall.
    { type: 'swell', x: WHEEL.x, z: WHEEL.z, radius: 3.2, height: -1.0 },
    TERRACE_1,
    TERRACE_2,
    RIVER,
    DECK,
  ],
};

// --- The boundary: where cultivation stops and the oldwood begins --------------

/** The boundary walk. The oldwood lies north of this line. */
const BOUNDARY: [number, number][] = [
  [-73, -25], [-75.5, -31], [-65, -38.5], [-56, -41], [-48, -40.8], [-38, -39.5], [-29, -43], [-21, -43.5],
  [-10, -41.5], [-2, -42.5], [3.5, -45.5], [11, -46], [19, -44.5],
];

/** z of the wood's edge at a given x (the walk, carried on to both map edges). */
function boundaryZ(x: number): number {
  const line: [number, number][] = [[-92, -24], ...BOUNDARY, [30, -47], [46, -52], [92, -54]];
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i]!;
    const [bx, bz] = line[i + 1]!;
    // The walk doubles back slightly at its west end; take the first stretch that spans x.
    const lo = ax < bx ? ax : bx;
    const hi = ax < bx ? bx : ax;
    if (x < lo || x > hi || ax === bx) continue;
    return az + ((bz - az) * (x - ax)) / (bx - ax);
  }
  return -50;
}

function build(): MapDef {
  const b = new RegionBuilder(BOUNDS, 20261112);

  // ---- Paths first: everything planted later keeps clear of them. -----------
  b.path('road', 4.4, [[-92, 12], [-70, 13], [-50, 11], [-30, 10.5], [-12, 11], [0, 11]]);
  b.path('road', 4.4, [[0, 11], [0, 4], [0, -1.5], [0, -20.5], [1, -27], [8, -35], [20, -45], [34, -56], [40, -66]]);
  b.path('lane', 3.2, [[0, 11], [14, 12.5], [30, 13], [46, 16], [58, 19], [74, 19], [92, 20]]);
  // Orchard lane: square -> both terrace ramps -> south edge.
  b.path('lane', 2.6, [[0, 11], [2.5, 17], [3, 26], [3, 31], [2.5, 38], [2, 46], [1, 56], [0, 66]]);
  b.path('lane', 2.8, [[-30, 10.5], [-30.5, 14], [-31, 17.4]]);
  // Press yard -> west ramp -> across terrace 1 -> second ramp.
  b.path('lane', 2.4, [[-33, 15.5], [-39, 17], [-40, 25], [-46, 31.5], [-45, 35], [-38, 40.5], [-30, 46.5], [-29, 51]]);
  // Mill road -> east ramps.
  b.path('lane', 2.4, [[46, 16], [44.5, 24], [44, 29.5], [42.5, 35], [38, 40], [36, 46], [35.5, 51]]);
  // Ford lane, hedged, and the lane on the north bank that bends round the witness tree.
  b.path('lane', 2.6, [[-70, 13], [-70.4, 4], [-69.4, -3.9], [-67, -11.5], [-64.6, -19.1], [-63, -21.2]]);
  b.path('lane', 2.6, [
    [1, -27], [-8, -27.5], [-12.5, -30], [-16, -33.2], [-21, -34], [-26, -31.5], [-29, -27], [-33, -23.5], [-44, -18],
    [-58, -20], [-63, -21.2], [-68, -22.5], [-73, -25],
  ]);
  b.path('track', 1.5, BOUNDARY);
  b.path('old_road', 3.4, [[8, -35], [-3, -43.5], [-17, -50], [-31, -54], [-40.5, -53.2]]);

  // ---- Water -----------------------------------------------------------------
  const fordAt = FORD.along;
  const bridgeAt = alongPolyline(RIVER_POINTS, BRIDGE.x, BRIDGE.z);
  const deckEdge = DECK.hz + 0.3;
  b.river({
    channel: RIVER,
    blockRadius: RIVER_BLOCK,
    openings: [{ from: fordAt - 4, to: fordAt + 4 }, { from: bridgeAt - deckEdge, to: bridgeAt + deckEdge }],
  });
  b.parapets(DECK, 17);
  b.terraceWalls(TERRACE_1, MAX_GRADE * 0.8);
  b.terraceWalls(TERRACE_2, MAX_GRADE * 0.8);

  // ---- Keep-clear spots ------------------------------------------------------
  const spawns: Point[] = [
    // Dark slots 0-3: the castle road, at the north edge.
    { x: 33.5, z: -59.5 }, { x: 36.8, z: -62 }, { x: 38.2, z: -57.5 }, { x: 41.5, z: -61 },
    // Light slots 4-7: the west road.
    { x: -87, z: 10.4 }, { x: -87, z: 13.6 }, { x: -84, z: 11.2 }, { x: -84, z: 14.4 },
  ];
  for (const s of spawns) b.reserve(s.x, s.z, 2.2);
  const sites = [
    { id: 0, x: -43.6, z: -54.6 }, // inside the ruin on the old road
    { id: 1, x: 68.5, z: 12 }, // the mill yard
  ];
  for (const s of sites) b.reserve(s.x, s.z, 2.6);
  b.reserve(WITNESS_A.x, WITNESS_A.z, 5.5).reserve(WITNESS_B.x, WITNESS_B.z, 6.5);
  b.reserve(0, 11, 5); // the square stays open
  b.reserve(FORD.x, FORD.z, 8);
  b.reserve(22, -47, 2.5); // Brute post

  // ---- Village ---------------------------------------------------------------
  const buildings: { kind: BuildingKind; x: number; z: number; fx: number; fz: number; variant: number; smoke: boolean }[] = [
    { kind: 'cottage_a', x: -9.5, z: 2.5, fx: 1, fz: 0, variant: 0, smoke: true },
    { kind: 'cottage_b', x: 9, z: 3, fx: -1, fz: 0, variant: 1, smoke: true },
    { kind: 'cottage_a', x: 22, z: 5.5, fx: 0, fz: 1, variant: 2, smoke: false },
    { kind: 'cottage_c', x: -22, z: 4.2, fx: 0, fz: 1, variant: 0, smoke: true },
    { kind: 'longhouse', x: -11, z: 21.5, fx: 0, fz: -1, variant: 0, smoke: true },
    { kind: 'cottage_c', x: 11.5, z: 22, fx: 0, fz: -1, variant: 1, smoke: false },
    { kind: 'cottage_b', x: 27, z: 21, fx: -0.3, fz: -1, variant: 2, smoke: true },
    { kind: 'cottage_a', x: 39, z: 23, fx: 0, fz: -1, variant: 1, smoke: false },
    { kind: 'cart_shed', x: -20.5, z: 15.6, fx: 0, fz: -1, variant: 0, smoke: false },
    { kind: 'press_house', x: -31, z: 21.5, fx: 0, fz: -1, variant: 0, smoke: true },
    { kind: 'storehouse', x: -45, z: 21, fx: 1, fz: 0, variant: 0, smoke: false },
    { kind: 'mill', x: 60, z: 11, fx: 0, fz: 1, variant: 0, smoke: false },
    { kind: 'barn', x: -9, z: -21.5, fx: 0, fz: -1, variant: 0, smoke: false },
    { kind: 'cottage_b', x: 8.5, z: -25, fx: -1, fz: 0, variant: 0, smoke: true },
  ];
  const smoke: SmokeSource[] = [];
  for (const h of buildings) {
    b.building(h.kind, h.x, h.z, h.fx, h.fz, h.variant);
    if (!h.smoke) continue;
    const len = Math.sqrt(h.fx * h.fx + h.fz * h.fz);
    const fx = h.fx / len;
    const fz = h.fz / len;
    const c = CHIMNEYS[h.kind];
    // local +x is (fz, -fx); local +z is the facing.
    smoke.push({ x: h.x + fz * c.x + fx * c.z, z: h.z - fx * c.x + fz * c.z, y: c.y });
  }

  // Square and yards.
  b.round('well', -5.2, 15.2).round('signpost', 3.1, 7.4, 1, 0.6);
  b.round('barrel_stack', -26.6, 15.4).round('crate_stack', -36.2, 16.6).round('cider_press', -35.6, 13.2, 1, 0.3);
  b.boxProp('cart', -40.2, 13.4, 1, 0.25).boxProp('cart', 66.5, 17, 1, -0.15).boxProp('cart', 16.5, 9.2, 1, 0.2);
  b.round('barrel_stack', 53.2, 15.8).round('crate_stack', 64.2, 15.2, 0.9);
  b.boxProp('log_pile', 15.5, 1.2, 0.2, 1).boxProp('log_pile', -16.8, -1.2, 1, 0.1).boxProp('trough', -3.6, 7.2, 1, 0);
  b.boxProp('trough', -14.5, -28.8, 1, 0.05).boxProp('beehives', 17, -19.4, 1, 0.1).boxProp('log_pile', 13.5, -21.2, 0.1, 1);
  b.round('barrel_stack', -3.2, 25.4, 0.9).round('crate_stack', 19.4, 18.4, 0.85).round('haystack', -15.8, -17.6, 0.8);

  // Garden walls and the village's own hedges.
  b.barrier('stone_wall', [[-14.5, -1.4], [-14.5, 7], [-12.6, 7]]);
  b.barrier('stone_wall', [[6.2, 7.4], [12.6, 7.4], [12.6, 6.4]]);
  b.barrier('stone_wall', [[17.6, 9.6], [26.4, 9.9]], [[3.2, 5.2]]);
  b.barrier('stone_wall', [[-17.8, 8.2], [-26.4, 8.2]], [[3.6, 5.6]]);
  b.barrier('hedge', [[13, -1.2], [17.4, 0.4]]);
  b.barrier('hedge', [[-4.4, 26.2], [1, 26.6]]);
  b.barrier('hedge', [[5.4, 26.4], [17.5, 26.2]]);
  b.barrier('fence', [[30.5, 17.6], [30.8, 24.6], [35, 26.6]]);
  b.barrier('fence', [[-13.8, -30.2], [-13.8, -26]]);

  // ---- The road west, and the hedged ford lane -----------------------------------
  // North side of the road: a tall hedge hides the water meadow and the ford lane.
  b.barrier('hedge', [[-82, 9], [-66, 9.4], [-46, 8], [-36, 7.2], [-28, 7.4]], [[8.6, 14.8]]);
  b.barrier('hedge', [[-73, 7.6], [-73.2, 3.6], [-72.2, -3.2]]);
  b.barrier('hedge', [[-67.6, 7.6], [-67.8, 3.6], [-66.8, -2.6]]);
  // South side: a low orchard wall with gates.
  b.barrier('stone_wall', [[-82, 16.2], [-66, 16.8], [-51, 14.6]], [[8, 11.4]]);
  b.barrier('stone_wall', [[-48.6, 14.2], [-42.4, 14], [-42.2, 15.4]]);
  // North bank: hedge between the ford lane and the bent lane, and along the castle road.
  b.barrier('hedge', [[-41.6, -15.6], [-33.6, -19.6], [-28.6, -21.6]]);
  b.barrier('hedge', [[-46, -14], [-56, -16.2], [-61.4, -17.6]]);
  b.barrier('hedge', [[12.4, -33.4], [18.4, -38.4], [26.2, -45.6]]);
  b.barrier('fence', [[13, -30.6], [28, -17.6], [46, -11.6]], [[14, 17.5]]);

  // ---- Terrace hedge: cover along the top of the first wall, behind the village ----
  b.barrier('hedge', [[30, 31.2], [7, 31.8]]);
  b.barrier('hedge', [[-1.2, 32], [-24, 32.6]]);
  b.barrier('hedge', [[-56, 33.5], [-72, 33.9]]);
  b.barrier('hedge', [[62, 30.4], [48.5, 30.8]]);
  // Upper terrace: a broken hedge and loose wall above the second step.
  b.barrier('hedge', [[26, 47.6], [8, 47.7]]);
  b.barrier('hedge', [[-8, 47.9], [-22, 48]]);
  b.barrier('hedge', [[-40, 48.2], [-58, 48.3]]);

  // ---- Region edges: something visible wherever the playable area stops ------------
  b.barrier('hedge', [[-90.6, 64.8], [-4, 64.8]]);
  b.barrier('hedge', [[4, 64.8], [90.6, 64.8]]);
  b.barrier('hedge', [[-90.8, 64.8], [-90.8, 16.6]]);
  b.barrier('hedge', [[-90.8, 7.6], [-90.8, -12]]);
  b.barrier('hedge', [[90.8, 64.8], [90.8, 23.6]]);
  b.barrier('hedge', [[90.8, 16.4], [90.8, 2]]);
  b.barrier('hedge', [[90.8, -15], [90.8, -46]]);

  // ---- The boundary: witness trees, marker stones, the walk ----------------------
  b.tree('tree_witness', WITNESS_A.x, WITNESS_A.z, 1.0, 0);
  b.tree('tree_witness', WITNESS_B.x, WITNESS_B.z, 1.05, 1);
  b.tree('tree_witness', -79.4, -27.8, 0.95, 2);
  b.tree('tree_witness', -25, -40.4, 1.1, 3);
  b.tree('tree_witness', 7.5, -42.5, 0.95, 1);
  b.tree('tree_witness', 27.5, -45.2, 1.0, 2);
  for (const [x, z] of [[-74.2, -29.4], [-63.6, -37.2], [-54.6, -39.2], [-39, -37.8], [-28, -41.2], [-11, -39.8], [0.2, -41], [12.4, -44.2], [-18.4, -29.6], [22.4, -42.2]] as const) {
    b.round('boundary_stone', x, z, 0.9 + b.random() * 0.25);
  }

  // ---- The old road and the ruin -----------------------------------------------
  b.barrier('ruin_wall', [[-48.6, -58.6], [-40.4, -58.6]], [[3.4, 4.6]]);
  b.barrier('ruin_wall', [[-48.6, -58.2], [-48.6, -54.2]]);
  b.barrier('ruin_fragment', [[-48.6, -53.6], [-48.6, -51.6], [-45.6, -51.4]]);
  b.barrier('ruin_wall', [[-39.4, -58.2], [-39.4, -55.4]]);
  b.barrier('ruin_fragment', [[-39.4, -54.8], [-39.4, -53.6]]);
  b.round('ruin_chimney', -40.4, -51.2, 1, 0.2);
  b.tree('tree_oldwood', -46.2, -56.6, 1.15);
  // The stone that should not be here, and the plot it was moved for.
  b.round('boundary_stone_fallen', -35.4, -50.2, 1, 0.9);
  b.orchardRow(-35, -58.6, -12, -57.2, 5.6, { feral: true });
  b.orchardRow(-33, -63, -14, -62, 5.6, { feral: true });
  // Saplings in the ruts: the wood taking the road back.
  for (const [x, z] of [[-1.6, -41.6], [-8.4, -46.8], [-12, -47.4], [-20.6, -51.6], [-25.4, -51.8], [-29.2, -54.6], [-36.4, -52.6], [3.4, -39.4]] as const) {
    b.tree('sapling', x, z, 0.8 + b.random() * 0.6);
  }
  b.thicket(-52.6, -53.4, 1.6, 1.1).thicket(-33.4, -55.6, 1.4, 1).thicket(-22.4, -47.2, 1.5, 0.9).thicket(-9.6, -50.6, 1.4, 1.1);
  b.round('boulder', -58.2, -47.2, 0.8).round('rock', -13.6, -44.2, 0.7).round('rock', -72.6, -6.4, 0.55).round('rock', -62.4, -17.4, 0.6);

  // ---- Orchards ---------------------------------------------------------------
  const rowsBeside = (t: TerraceFeature, offsets: number[], from: number, to: number, spacing: number) => {
    const dx = t.b.x - t.a.x;
    const dz = t.b.z - t.a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const ux = dx / len;
    const uz = dz / len;
    // Uphill normal (left of a -> b).
    const nx = uz;
    const nz = -ux;
    for (const off of offsets) {
      const ax = t.a.x + ux * from - nx * off;
      const az = t.a.z + uz * from - nz * off;
      const bx = t.a.x + ux * to - nx * off;
      const bz = t.a.z + uz * to - nz * off;
      b.orchardRow(ax, az, bx, bz, spacing);
      b.plots.push({
        outline: [
          { x: ax - nx * 2.4, z: az - nz * 2.4 }, { x: bx - nx * 2.4, z: bz - nz * 2.4 },
          { x: bx + nx * 2.4, z: bz + nz * 2.4 }, { x: ax + nx * 2.4, z: az + nz * 2.4 },
        ],
        rowUx: ux, rowUz: uz, rowSpacing: 5.5,
      });
    }
  };
  // Offsets are measured downhill (north) from the wall, so a negative offset is on the terrace above it.
  rowsBeside(TERRACE_1, [-5.2, -10.2], 6, 146, 4.7); // first terrace
  rowsBeside(TERRACE_2, [-5.2, -10.2, -15.2], 4, 132, 4.7); // upper terrace
  rowsBeside(TERRACE_1, [4.6, 9.6], 126, 156, 4.7); // west plot, below the wall
  rowsBeside(TERRACE_1, [4.4], 36, 56, 4.7); // the old trees behind the cottages
  rowsBeside(TERRACE_1, [5.4, 10.4], 4, 22, 4.7); // the miller's plot
  // North orchard, between the bent lane and the boundary walk.
  for (const z of [-25.6, -31, -36.4]) {
    b.orchardRow(-70, z + 0.6, -30, z - 0.4, 4.7);
    b.plots.push({ outline: [{ x: -70, z: z - 2 }, { x: -30, z: z - 3 }, { x: -30, z: z + 2 }, { x: -70, z: z + 3 }], rowUx: 1, rowUz: 0, rowSpacing: 5.5 });
  }

  // ---- Meadow, riverside and coppice ---------------------------------------------
  for (const [x, z] of [[30, -22], [45, -17.5], [54, -27], [38, -31.5], [66, -21], [74, -31]] as const) b.round('haystack', x, z, 0.9 + b.random() * 0.25);
  // Willows and alders along the banks, outside the village.
  for (let s = 40; s < 300; s += 9) {
    const t = pointAlong(RIVER_POINTS, s);
    if (!t) continue;
    if (t.x > -30 && t.x < 30) continue;
    const side = b.random() < 0.5 ? -1 : 1;
    const off = RIVER_BLOCK + 1.1 + b.random() * 1.8;
    b.tryTree(b.random() < 0.7 ? 'tree_willow' : 'tree_birch', t.x - t.uz * off * side, t.z + t.ux * off * side, 0.85 + b.random() * 0.4, 0.8, 1.2);
  }
  // Roadside and field trees.
  for (const [x, z, kind] of [
    [-74, 6, 'tree_oak'], [-62, 4.4, 'tree_birch'], [-33, 2.6, 'tree_birch'], [48, 9.6, 'tree_oak'], [78, 14, 'tree_oak'],
    [72, 24.6, 'tree_birch'], [-84, 20.4, 'tree_oak'], [50, 23, 'tree_birch'], [18, -27.6, 'tree_oak'], [60, -12.6, 'tree_oak'],
    [82, -24, 'tree_oak'], [-60, -26.4, 'tree_birch'], [32, 6.4, 'tree_birch'], [-85, -8, 'tree_willow'],
  ] as const) b.tryTree(kind, x, z, 0.9 + b.random() * 0.35, 0.6, 0.9);

  // Coppice: the worked wood east of the castle road.
  b.scatter(
    { minX: 30, maxX: 90, minZ: -65, maxZ: -40 }, 4.3,
    (x, z) => z < boundaryZ(x) - 1.5,
    (_x, _z, roll) => (roll < 0.56 ? { kind: 'coppice_stool', scale: 0.8 + roll * 0.6 } : roll < 0.76 ? { kind: 'tree_birch', scale: 0.9 + roll * 0.5 } : roll < 0.84 ? { kind: 'tree_oak', scale: 1 + roll * 0.3 } : null),
    0.9, 1.5,
  );
  b.boxProp('log_pile', 31, -50.2, 1, -0.8).boxProp('log_pile', 46, -55.4, 1, 0.2);

  // The oldwood: big, irregular and not planted by anyone.
  b.scatter(
    { minX: -91, maxX: 29, minZ: -65, maxZ: -24 }, 4.4,
    (x, z) => z < boundaryZ(x) - 2.2,
    (x, z, roll) => {
      const depth = boundaryZ(x) - z;
      if (roll < 0.52) return { kind: 'tree_oldwood', scale: 0.85 + roll * 1.2 };
      if (roll < 0.7) return { kind: 'tree_oak', scale: 1.15 + (roll - 0.5) * 1.5 };
      if (roll < 0.8) return { kind: depth < 9 ? 'tree_birch' : 'tree_dead', scale: 1 + (roll - 0.7) * 3 };
      return null;
    },
    1.0, 1.7,
  );
  // Undergrowth along the north edge: where the map stops, the wood closes.
  for (let x = -88; x < 90; x += 7) {
    if (x > 31 && x < 46) continue; // the castle road
    const hx = 2.6 + b.random() * 1.2;
    if (b.isClear(x, -64.4, hx, 0.2, 1.4)) b.thicket(x, -64.4, hx, 1.0);
  }
  for (const [x, z] of [[-88, -40], [-84, -52], [-70, -50], [-62, -58], [-14, -60], [4, -56], [16, -60], [24, -54]] as const) {
    if (b.isClear(x, z, 1.8, 0.4, 1.6)) b.thicket(x, z, 1.2 + b.random() * 0.8, 0.9 + b.random() * 0.5);
  }

  // ---- Loose dressing (no colliders, nothing tall) -------------------------------
  for (let k = -3; k <= 3; k++) {
    // Stepping stones across the ford, at right angles to the flow.
    const along = 1.9 + (b.random() - 0.5) * 0.4; // a little downstream of the cart track
    b.dress(
      'stepping_stone', FORD.x + FORD_ACROSS.x * k * 1.3 + FORD_ACROSS.z * along, FORD.z + FORD_ACROSS.z * k * 1.3 - FORD_ACROSS.x * along,
      b.random() * 6.28, 0.85 + b.random() * 0.4,
    );
  }
  b.dress('lantern_post', -2.9, -1.2, 0).dress('lantern_post', 2.9, -20.8, 3.14);
  b.dress('milestone', -88.5, 15.4, 0.3).dress('milestone', 36.4, -63.4, 0.2).dress('milestone', 89, 22.6, 1.2).dress('milestone', 2.6, 63, 0);
  b.dress('bench', -11, 17.6, 0).dress('bench', 5.6, 10.4, 1.57).dress('bucket', -4.2, 16.4, 0).dress('bucket', -6.3, 14.2, 1);
  b.dress('barrel', -27.4, 17.3, 0).dress('barrel', -25.3, 16.6, 1).dress('barrel', -35.4, 17.3, 0).dress('sack', -37.2, 17.2, 0.4);
  b.dress('basket', -34, 16.2, 0).dress('basket', -32.6, 15.4, 2).dress('apple_pile', -34.6, 15, 0, 1.6).dress('apple_pile', -28.8, 16.6, 1, 1.2);
  b.dress('crate', -41.2, 16.2, 0.2).dress('crate', -40.6, 17.4, 1.1).dress('sack', 56.2, 15.4, 0).dress('sack', 57.3, 15.6, 0.8).dress('sack', 56.7, 15.9, 2);
  b.dress('grindstone', 65.6, 13.6, 0.5).dress('handcart', 51, 18.2, 0.3).dress('handcart', -8.6, 9, 2.4).dress('barrel', 62.6, 15.2, 0);
  b.dress('flower_tub', -5.6, 1, 0).dress('flower_tub', -5.6, 4, 0).dress('flower_tub', 6, 1.6, 0).dress('flower_tub', 21, 9, 0).dress('flower_tub', 9.6, 18.6, 0);
  b.dress('washing_line', -23.5, -0.6, 0.1).dress('washing_line', 32.6, 21.4, 1.5).dress('chopping_block', 14.2, -1, 0).dress('chopping_block', 12.2, -19.6, 0);
  b.dress('stump', -66.4, -40.4, 0).dress('stump', -30.6, -45.2, 1).dress('stump', 33.4, -47.6, 2).dress('stump', 52, -46.2, 0.5).dress('stump', 64, -52.4, 0.5);
  b.dress('basket', 4.6, 33.4, 0).dress('ladder', -9.2, -17.6, yawFacing(0, -1)).dress('bucket', -12.2, -27.6, 0).dress('sack', -5.2, -26, 1);
  b.dress('cart_rut_stone', -6.6, -45.4, 0.4).dress('cart_rut_stone', -24.2, -52.9, 1.2).dress('cart_rut_stone', 2.2, -39.8, 2.2);

  // ---- Ground character (painted by the renderer; no gameplay) ---------------------
  const patches: GroundPatch[] = [
    { kind: 'cobbles', x: 0, z: 11, radius: 7.5 },
    { kind: 'village_yard', x: -33, z: 15, radius: 6.5, x2: -40, z2: 15.5 },
    { kind: 'village_yard', x: 58, z: 16.5, radius: 6, x2: 66, z2: 16 },
    { kind: 'village_yard', x: -10, z: 13, radius: 5, x2: 12, z2: 13.5 },
    { kind: 'village_yard', x: -10, z: -27, radius: 4.5, x2: 6, z2: -27 },
    { kind: 'garden', x: -9.5, z: -3.2, radius: 2.6 }, { kind: 'garden', x: 10, z: 9.4, radius: 2.2 }, { kind: 'garden', x: 22, z: 0.4, radius: 2.4 },
    { kind: 'garden', x: -22, z: -0.4, radius: 2.2 }, { kind: 'garden', x: 15, z: -24, radius: 3 }, { kind: 'garden', x: 33.5, z: 22.4, radius: 2.6 },
    { kind: 'meadow', x: -58, z: 1.5, radius: 7, x2: -38, z2: 2 },
    { kind: 'hay_field', x: 34, z: -24, radius: 13, x2: 72, z2: -24 },
    { kind: 'coppice_floor', x: 44, z: -58, radius: 12, x2: 84, z2: -58 },
    { kind: 'oldwood_floor', x: -84, z: -52, radius: 22, x2: 14, z2: -60 },
    { kind: 'oldwood_floor', x: -84, z: -38, radius: 9, x2: -70, z2: -46 },
  ];

  const locations: LocationDef[] = [
    { id: 'village_square', label: 'Village square', x: 0, z: 11, radius: 8, tags: ['settlement', 'crossroads'] },
    { id: 'stone_bridge', label: 'Stone bridge', x: BRIDGE.x, z: BRIDGE.z, radius: 10, tags: ['crossing', 'public_route'] },
    { id: 'ford', label: 'The ford', x: FORD.x, z: FORD.z, radius: 6, tags: ['crossing', 'work_path'] },
    { id: 'press_yard', label: 'Press yard and storehouse', x: -35, z: 15.5, radius: 9, tags: ['settlement', 'work'] },
    { id: 'mill', label: 'Watermill', x: 60, z: 15.5, radius: 9, tags: ['settlement', 'work'] },
    { id: 'lower_terrace', label: 'Terrace orchard', x: 0, z: 38, radius: 12, tags: ['orchard'] },
    { id: 'upper_terrace', label: 'Upper orchard', x: 0, z: 56, radius: 12, tags: ['orchard'] },
    { id: 'north_orchard', label: 'North orchard', x: -48, z: -29, radius: 12, tags: ['orchard'] },
    { id: 'witness_bend', label: 'The lane round the witness tree', x: WITNESS_A.x, z: WITNESS_A.z, radius: 8, tags: ['boundary', 'landmark'] },
    { id: 'boundary_walk', label: 'Boundary walk', x: -38, z: -39.5, radius: 10, tags: ['boundary', 'work_path'] },
    { id: 'old_road_ruin', label: 'Ruin on the old road', x: RUIN.x, z: RUIN.z, radius: 9, tags: ['ruin', 'oldwood'] },
    { id: 'hay_meadow', label: 'Hay meadow', x: 48, z: -24, radius: 16, tags: ['field'] },
    { id: 'coppice', label: 'Coppice', x: 60, z: -56, radius: 14, tags: ['woodland', 'work'] },
  ];

  const connectors: ConnectorDef[] = [
    { id: 'west_road', x: -92, z: 12, outX: -1, outZ: 0, kind: 'road', toward: 'neighbouring region, not yet authored' },
    { id: 'castle_road', x: 40, z: -66, outX: 0, outZ: -1, kind: 'road', toward: 'the road north, towards the castle' },
    { id: 'mill_lane', x: 92, z: 20, outX: 1, outZ: 0, kind: 'lane', toward: 'downstream valley, not yet authored' },
    { id: 'orchard_track', x: 0, z: 66, outX: 0, outZ: 1, kind: 'trail', toward: 'the hills south of the valley, not yet authored' },
  ];

  return {
    id: 'orchard_vale_v1',
    halfSize: 92,
    bounds: BOUNDS,
    terrain: TERRAIN,
    props: b.props,
    paths: [],
    spawns,
    patrolRoutes: [
      // The Scout's beat: the square, over the bridge, the junction and the fork to the old road.
      [{ x: 1.5, z: 13 }, { x: 0, z: -1.5 }, { x: 0.6, z: -25.5 }, { x: 8.5, z: -34 }, { x: 0.6, z: -25.5 }, { x: 0, z: -1.5 }],
    ],
    monsters: [
      { type: 'scout', ownerSlot: 0, route: 0 },
      // Holds the road north. It answers alerts; it raises none (existing M1 unit rules).
      { type: 'brute', ownerSlot: 1, post: { x: 22, z: -47 } },
    ],
    sites,
    landmarks: [{ kind: 'castle', x: 96, z: -390 }],
    region: {
      environment: 'orchard_vale',
      paths: b.paths,
      plots: b.plots,
      patches,
      dressing: b.dressing,
      locations,
      connectors,
      smoke,
      wheels: [WHEEL],
    },
  };
}

/** Where each building kind's chimney top is, in the building's own frame
 *  (x along the front, z towards the front door, y above the ground). The
 *  model builders read the same table, so smoke rises from a real chimney. */
export const CHIMNEYS: Record<BuildingKind, { x: number; y: number; z: number }> = {
  cottage_a: { x: -2.3, y: 7.4, z: -0.6 },
  cottage_b: { x: 1.0, y: 6.7, z: -0.4 },
  cottage_c: { x: -3.0, y: 6.9, z: -0.5 },
  longhouse: { x: 4.2, y: 9.5, z: -0.8 },
  press_house: { x: -4.4, y: 7.3, z: -1.6 },
  storehouse: { x: 0, y: 0, z: 0 },
  cart_shed: { x: 0, y: 0, z: 0 },
  mill: { x: 0, y: 0, z: 0 },
  barn: { x: 0, y: 0, z: 0 },
};

/** Point and unit direction at a distance along a polyline. */
function pointAlong(points: readonly Point[], s: number): { x: number; z: number; ux: number; uz: number } | null {
  let run = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const c = points[i + 1]!;
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (s <= run + len) {
      const t = (s - run) / len;
      return { x: a.x + dx * t, z: a.z + dz * t, ux: dx / len, uz: dz / len };
    }
    run += len;
  }
  return null;
}

export const ORCHARD_VALE: MapDef = build();

/** Footprints are re-exported for the renderer, which sizes models to them. */
export { FOOTPRINTS };
