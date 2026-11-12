/**
 * Orchard Vale: the claims made about the region, measured on the real
 * geometry and the real simulation. The region is an authored test slice
 * (docs/design/region-prototype-orchard-vale.md is unapproved candidate
 * direction); these tests are about playability, not lore.
 */
import { describe, expect, it } from 'vitest';
import { MatchConfig } from '../src/server/MatchRoom.ts';
import { exposure, isBlocked, segmentWalkable, sightBlocked } from '../src/shared/sim/geometry.ts';
import { FOREST_CROSSING, boundsOf, getMap, type MapDef, type Point } from '../src/shared/sim/map.ts';
import { findPath, navTilesBuilt, nearestWalkable, pathLength } from '../src/shared/sim/nav.ts';
import { createSim, hashState, occupySlot, step } from '../src/shared/sim/simulation.ts';
import { groundHeight, polylineNearest, surfaceHeight, waterLevel, type ChannelFeature, type DeckFeature } from '../src/shared/sim/terrain.ts';
import { TUNING } from '../src/shared/sim/tuning.ts';
import { ORCHARD_VALE as MAP } from '../src/shared/world/orchardVale.ts';
import { DARK_MATE, DARK_OWNER, LIGHT, cmd, place, post, run, runUntil, view, world } from './helpers.ts';

const HERO = TUNING.hero.radius;
const SCOUT = TUNING.monsters.scout;
const BRUTE = TUNING.monsters.brute;
const B = boundsOf(MAP);
const region = MAP.region!;
const river = MAP.terrain!.features.find((f): f is ChannelFeature => f.type === 'channel')!;
const deck = MAP.terrain!.features.find((f): f is DeckFeature => f.type === 'deck')!;
const loc = (id: string): Point => region.locations.find((l) => l.id === id)!;
const lightSpawn = MAP.spawns[4]!;
const darkSpawn = MAP.spawns[0]!;

function route(from: Point, via: Point[], radius = HERO): Point[] {
  const points: Point[] = [from];
  for (const next of via) {
    const leg = findPath(MAP, radius, points.at(-1)!, next);
    expect(leg, `no path to ${next.x}, ${next.z}`).not.toBeNull();
    points.push(...leg!);
  }
  return points;
}

/** Points every quarter metre along a walked route. */
function samples(points: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  out.push(points.at(-1)!);
  return out;
}

/** Every half metre of the Scout's patrol loop. */
const beat: Point[] = [];
{
  const loop = MAP.patrolRoutes[0]!;
  loop.forEach((a, i) => {
    const b = loop[(i + 1) % loop.length]!;
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
    for (let k = 0; k < n; k++) beat.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  });
}
/** Could the patrolling Scout see this spot from anywhere on its beat? */
const watched = (p: Point) => beat.some((s) => Math.hypot(s.x - p.x, s.z - p.z) <= SCOUT.viewRange && exposure(MAP, s.x, s.z, p.x, p.z, HERO) > 0);
const watchedMetres = (points: Point[]) => samples(points).filter(watched).length * 0.25;

describe('Orchard Vale is a server-selected region, not a replacement', () => {
  it('is registered, and the default match is still the forest crossing', () => {
    expect(getMap('orchard_vale_v1')).toBe(MAP);
    expect(new MatchConfig().mapId).toBe(FOREST_CROSSING.id);
  });

  it('is a rectangle that is not the old 60 m square, with eight spawns on walkable ground', () => {
    expect(B.maxX - B.minX).toBeGreaterThan(150);
    expect(B.maxZ - B.minZ).toBeGreaterThan(110);
    expect(MAP.spawns).toHaveLength(8);
    for (const s of MAP.spawns) expect(isBlocked(MAP, s.x, s.z, 1.0), `spawn ${s.x}, ${s.z}`).toBe(false);
  });

  it('has the places the brief asks for, as named locations', () => {
    for (const id of ['village_square', 'stone_bridge', 'ford', 'press_yard', 'mill', 'lower_terrace', 'upper_terrace', 'north_orchard', 'witness_bend', 'boundary_walk', 'old_road_ruin']) {
      expect(region.locations.some((l) => l.id === id), id).toBe(true);
    }
    const kinds = new Set(MAP.props.map((p) => p.kind));
    for (const kind of ['cottage_a', 'cottage_b', 'cottage_c', 'longhouse', 'press_house', 'storehouse', 'mill', 'barn', 'tree_apple', 'tree_witness', 'boundary_stone', 'hedge', 'stone_wall', 'terrace_wall', 'bridge_parapet', 'ruin_wall']) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
    expect(MAP.props.filter((p) => p.kind.startsWith('tree_apple')).length).toBeGreaterThan(150);
  });
});

describe('navigation: everything that matters is connected', () => {
  it('a hero can walk from the west gate to every location, site and connector', () => {
    const goals: Point[] = [...region.locations, ...MAP.sites, ...region.connectors, ...MAP.spawns];
    for (const goal of goals) {
      const target = nearestWalkable(MAP, HERO, Math.min(Math.max(goal.x, B.minX + 1), B.maxX - 1), Math.min(Math.max(goal.z, B.minZ + 1), B.maxZ - 1))!;
      const path = findPath(MAP, HERO, lightSpawn, target);
      expect(path, `to ${goal.x}, ${goal.z}`).not.toBeNull();
      const end = path!.at(-1)!;
      expect(Math.hypot(end.x - target.x, end.z - target.z)).toBeLessThan(0.01);
    }
  });

  it('the Scout can walk its whole beat and the Brute can leave its post for the square', () => {
    const loop = MAP.patrolRoutes[0]!;
    loop.forEach((a, i) => expect(findPath(MAP, SCOUT.radius, a, loop[(i + 1) % loop.length]!)).not.toBeNull());
    const brute = MAP.monsters.find((m) => m.type === 'brute')!.post!;
    const path = findPath(MAP, BRUTE.radius, brute, loc('village_square'));
    expect(path).not.toBeNull();
    // It can only have got there over the bridge.
    expect(samples([brute, ...path!]).some((p) => Math.hypot(p.x - deck.x, p.z - deck.z) < 1.5)).toBe(true);
  });

  it('every path waypoint returned is standable, across 300 random journeys', () => {
    let seed = 7;
    const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let k = 0; k < 300; k++) {
      const a = nearestWalkable(MAP, HERO, B.minX + 2 + rand() * (B.maxX - B.minX - 4), B.minZ + 2 + rand() * (B.maxZ - B.minZ - 4))!;
      const b = nearestWalkable(MAP, HERO, B.minX + 2 + rand() * (B.maxX - B.minX - 4), B.minZ + 2 + rand() * (B.maxZ - B.minZ - 4))!;
      const path = findPath(MAP, HERO, a, b);
      if (!path) continue; // a pocket nothing can reach, e.g. enclosed by walls
      for (const p of path) expect(isBlocked(MAP, p.x, p.z, HERO)).toBe(false);
      const end = path.at(-1)!;
      expect(Math.hypot(end.x - b.x, end.z - b.z)).toBeLessThan(0.01);
    }
  });

  it('the walkable grid is built in tiles, on demand', () => {
    const fresh: MapDef = { ...MAP, id: 'orchard_vale_nav_probe' };
    findPath(fresh, HERO, { x: -84, z: 12 }, { x: -80, z: 5 }); // round the end of a hedge
    const short = navTilesBuilt(fresh, HERO);
    expect(short.built).toBeGreaterThan(0);
    expect(short.built).toBeLessThan(short.total / 3);
  });
});

describe('the river', () => {
  const inside = river.points.filter((p) => p.x > B.minX && p.x < B.maxX);
  const riverLine = river.points;

  it('cannot be stood in, except on the bridge and at the ford', () => {
    let wet = 0;
    for (let x = B.minX + 1; x < B.maxX - 1; x += 0.5) {
      for (let z = -32; z < 12; z += 0.5) {
        const near = polylineNearest(riverLine, x, z);
        if (near.dist > river.halfWidth) continue;
        if (isBlocked(MAP, x, z, HERO)) continue;
        wet++;
        const onDeck = Math.abs(x - deck.x) <= deck.hz && Math.abs(z - deck.z) <= deck.hx;
        const atFord = Math.hypot(x - river.fords[0]!.x, z - river.fords[0]!.z) < 7;
        expect(onDeck || atFord, `standable water at ${x}, ${z}`).toBe(true);
      }
    }
    expect(wet).toBeGreaterThan(50); // the two crossings themselves
    expect(inside.length).toBeGreaterThan(6);
  });

  it('is crossed in exactly two places: every other straight line across it is blocked', () => {
    let open = 0;
    for (let x = B.minX + 2; x < B.maxX - 2; x += 0.5) {
      // Find the river here, and try to walk straight across it north-south.
      let zc = 0;
      let best = Infinity;
      for (let z = -32; z < 12; z += 0.25) {
        const d = polylineNearest(riverLine, x, z).dist;
        if (d < best) { best = d; zc = z; }
      }
      const a = { x, z: zc - 9 };
      const b = { x, z: zc + 9 };
      if (!segmentWalkable(MAP, a.x, a.z, b.x, b.z, HERO)) continue;
      open++;
      expect(Math.abs(x - deck.x) < deck.hz || Math.abs(x - river.fords[0]!.x) < 7, `open crossing at x=${x}`).toBe(true);
    }
    expect(open).toBeGreaterThan(4);
  });

  it('the bridge deck carries a hero, a Scout and a Brute from bank to bank', () => {
    for (const r of [HERO, SCOUT.radius, BRUTE.radius]) {
      expect(segmentWalkable(MAP, deck.x, deck.z + deck.hx + 1, deck.x, deck.z - deck.hx - 1, r)).toBe(true);
    }
    // The deck is above the water and its crown is higher than its ends.
    expect(surfaceHeight(MAP, deck.x, deck.z)).toBeGreaterThan(river.waterY + 1.2);
    expect(surfaceHeight(MAP, deck.x, deck.z)).toBeGreaterThan(surfaceHeight(MAP, deck.x, deck.z + deck.hx - 0.2) + 0.5);
    // Under the deck the bare ground is the river bed.
    expect(groundHeight(MAP.terrain, deck.x, deck.z)).toBeLessThan(river.waterY);
  });

  it('the ford is wet but shallow; elsewhere the water is deep', () => {
    const ford = river.fords[0]!;
    const depthAtFord = river.waterY - surfaceHeight(MAP, ford.x, ford.z);
    expect(depthAtFord).toBeGreaterThan(0.05);
    expect(depthAtFord).toBeLessThan(0.3);
    expect(river.waterY - surfaceHeight(MAP, 30, -6.8)).toBeGreaterThan(0.5);
    expect(waterLevel(MAP, ford.x, ford.z)).toBe(river.waterY);
    expect(waterLevel(MAP, 0, 40)).toBeNull();
  });
});

describe('terrain: what is drawn as walkable is walkable, and nothing else', () => {
  // The client stands actors and builds the ground from surfaceHeight(); this
  // is the contract that keeps a 2D simulation honest on a relief map.
  const cell = 0.5;
  const nx = Math.round((B.maxX - B.minX) / cell);
  const nz = Math.round((B.maxZ - B.minZ) / cell);
  const free = new Uint8Array(nx * nz);
  const height = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = B.minX + (i + 0.5) * cell;
      const z = B.minZ + (j + 0.5) * cell;
      free[j * nx + i] = isBlocked(MAP, x, z, HERO) ? 0 : 1;
      height[j * nx + i] = surfaceHeight(MAP, x, z);
    }
  }

  it('no standable ground is steeper than the walkable grade', () => {
    const limit = MAP.terrain!.maxWalkableGrade;
    let steepest = 0;
    let where = '';
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const c = j * nx + i;
        if (!free[c]) continue;
        for (const n of [c + 1, c + nx]) {
          if (!free[n]) continue;
          const grade = Math.abs(height[n]! - height[c]!) / cell;
          if (grade > steepest) {
            steepest = grade;
            where = `${B.minX + (i + 0.5) * cell}, ${B.minZ + (j + 0.5) * cell}`;
          }
        }
      }
    }
    expect(steepest, `steepest standable grade ${steepest.toFixed(3)} at ${where}`).toBeLessThanOrEqual(limit);
  });

  it('nobody can stand in water deeper than the ford', () => {
    for (let c = 0; c < free.length; c++) {
      if (!free[c]) continue;
      const x = B.minX + ((c % nx) + 0.5) * cell;
      const z = B.minZ + (Math.floor(c / nx) + 0.5) * cell;
      const water = waterLevel(MAP, x, z);
      if (water === null) continue;
      expect(height[c]!, `submerged standable ground at ${x}, ${z}`).toBeGreaterThan(water - 0.2);
    }
  });

  it('the terraces are real steps held by walls, opened only by ramps', () => {
    // Up on the first terrace is about a metre above the ground below it.
    const below = surfaceHeight(MAP, -10, 27.5);
    const above = surfaceHeight(MAP, -10, 36);
    expect(above - below).toBeGreaterThan(0.9);
    // Straight up the face: blocked. Up the ramp on the orchard lane: open.
    expect(segmentWalkable(MAP, -10, 27.5, -10, 36, HERO)).toBe(false);
    expect(segmentWalkable(MAP, 3, 26, 3, 37, HERO)).toBe(true);
    expect(MAP.props.filter((p) => p.kind === 'terrace_wall').length).toBeGreaterThanOrEqual(6);
  });

  it('the valley has relief: banks, terraces and a knoll, within a few metres', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let c = 0; c < free.length; c++) {
      if (!free[c]) continue;
      lo = Math.min(lo, height[c]!);
      hi = Math.max(hi, height[c]!);
    }
    expect(hi - lo).toBeGreaterThan(3);
    expect(hi - lo).toBeLessThan(8);
  });
});

describe('cover is exactly what the simulation sees', () => {
  it('a hedge hides, a low wall does not, a cottage does, a thin young tree does not', () => {
    // Hedge on the north side of the west road.
    expect(sightBlocked(MAP, -78, 12, -78, 6)).toBe(true);
    // Low orchard wall on its south side.
    expect(sightBlocked(MAP, -79, 13, -79, 19.5)).toBe(false);
    expect(segmentWalkable(MAP, -79, 13, -79, 19.5, HERO)).toBe(false);
    // Across the first cottage.
    expect(sightBlocked(MAP, -16, 2.5, -3, 2.5)).toBe(true);
    for (const p of MAP.props) {
      if (p.kind === 'tree_apple_young' || p.kind === 'sapling' || p.kind === 'stone_wall' || p.kind === 'terrace_wall' || p.kind === 'fence' || p.kind === 'water' || p.kind === 'bridge_parapet') {
        expect(p.blocksSight, p.kind).toBe(false);
      }
      if (p.kind === 'hedge' || p.kind === 'tree_witness' || p.kind.startsWith('cottage') || p.kind === 'ruin_wall') expect(p.blocksSight, p.kind).toBe(true);
    }
  });

  it('a witness tree is real cover: fully hidden straight behind it, exposed beside it', () => {
    const tree = MAP.props.find((p) => p.kind === 'tree_witness')!;
    const r = tree.collider.shape === 'circle' ? tree.collider.radius : 0;
    expect(exposure(MAP, tree.x, tree.z + 9, tree.x, tree.z - r - HERO - 0.1, HERO)).toBe(0);
    expect(exposure(MAP, tree.x, tree.z + 9, tree.x + 4, tree.z - r - HERO - 0.1, HERO)).toBe(1);
  });
});

describe('routes: the road is fast and watched, the ford and the terraces are longer and hidden', () => {
  const ruin = MAP.sites[0]!;
  const mill = MAP.sites[1]!;

  it('ruin to mill by the road crosses the bridge and spends a long time in the Scout\'s view', () => {
    const road = route(ruin, [mill]);
    expect(samples(road).some((p) => Math.hypot(p.x - deck.x, p.z - deck.z) < 1.5)).toBe(true);
    expect(watchedMetres(road)).toBeGreaterThan(40);
  });

  it('the same journey by the ford and the terraces is longer but almost never watched', () => {
    const road = route(ruin, [mill]);
    const quiet = route(ruin, [
      { x: -52, z: -44 }, { x: -60, z: -30 }, { x: -64, z: -20.5 }, loc('ford'), { x: -70.2, z: 3 }, { x: -70, z: 12.5 }, { x: -41, z: 12 },
      { x: -40, z: 25 }, { x: -46, z: 32 }, { x: -44, z: 37.5 }, { x: 0, z: 37.5 }, { x: 40, z: 36.5 }, { x: 44, z: 29.5 }, { x: 45, z: 22 }, { x: 52, z: 22 }, mill,
    ]);
    const roadLen = pathLength(road[0]!, road.slice(1));
    const quietLen = pathLength(quiet[0]!, quiet.slice(1));
    expect(quietLen).toBeGreaterThan(roadLen * 1.2);
    expect(watchedMetres(quiet)).toBeLessThan(watchedMetres(road) * 0.2);
    // It really does use the ford, not the bridge.
    expect(samples(quiet).some((p) => Math.hypot(p.x - deck.x, p.z - deck.z) < 6)).toBe(false);
  });

  it('west gate to the north orchard by the ford lane is never in view of the beat', () => {
    const lane = route(lightSpawn, [{ x: -70, z: 12.5 }, { x: -70.2, z: 3 }, loc('ford'), { x: -64, z: -20.5 }, loc('north_orchard')]);
    expect(watchedMetres(lane)).toBe(0);
  });

  it('the lane bends round the witness tree instead of taking the straight line', () => {
    const lane = region.paths.find((p) => p.kind === 'lane' && p.points.some((q) => q.x === -21 && q.z === -34))!;
    const bend = loc('witness_bend');
    // The straight line between the lane's ends either side of the tree passes through its trunk...
    const a = lane.points.find((q) => q.x === -8)!;
    const b = lane.points.find((q) => q.x === -33)!;
    expect(segmentWalkable(MAP, a.x, a.z, b.x, b.z, HERO)).toBe(false);
    // ...and the lane itself keeps at least five metres from it.
    for (const q of lane.points) expect(Math.hypot(q.x - bend.x, q.z - bend.z)).toBeGreaterThan(5);
  });
});

describe('the M1 hunt works here unchanged', () => {
  const mapId = MAP.id;
  it('sighting -> shared alert -> chase -> line of sight broken by a cottage -> search -> back to the beat', () => {
    const w = world(3, mapId);
    post(w.scout, 0, 9, 0, -1); // in the square, looking north up the bridge road
    place(w.hero, 0, 0.5); // in the open road, between the cottages
    expect(runUntil(w.sim, () => w.brain.mode === 'chase', 400)).toBeGreaterThan(0);

    // D-012: every Dark seat gets the time-stamped sighting; only the owner sees the Scout's live view.
    const owner = view(w.sim, DARK_OWNER);
    const mate = view(w.sim, DARK_MATE);
    expect(owner.evidence.filter((e) => e.kind === 'sighting')).toHaveLength(1);
    expect(mate.evidence.filter((e) => e.kind === 'sighting')).toHaveLength(1);
    expect(owner.actors.some((a) => a.id === w.hero.id)).toBe(true);
    expect(mate.actors.some((a) => a.id === w.hero.id)).toBe(false);
    expect(view(w.sim, LIGHT).you!.spotted).toBe(true);

    // Escape: over the bridge is open, so duck west behind the first cottage and keep going along the bank.
    step(w.sim, [cmd(LIGHT, { type: 'moveTo', x: -16, z: -2.6 })]);
    expect(runUntil(w.sim, () => w.brain.lostTicks > 0, 400), 'the cottage should break line of sight').toBeGreaterThan(0);
    runUntil(w.sim, () => w.hero.intent.type === 'idle', 300);
    step(w.sim, [cmd(LIGHT, { type: 'moveTo', x: -31, z: 3.6 })]);
    runUntil(w.sim, () => w.hero.intent.type === 'idle', 300);
    step(w.sim, [cmd(LIGHT, { type: 'moveTo', x: -66, z: -26 })]); // on behind the roadside hedge, over the ford
    expect(runUntil(w.sim, () => w.brain.mode === 'search', 900), 'the Scout should end up searching').toBeGreaterThan(0);
    // While searching it knows only where it last saw the hero.
    const seen = w.brain.lastSeen!;
    expect(Math.hypot(seen.x - w.hero.x, seen.z - w.hero.z)).toBeGreaterThan(3);
    expect(runUntil(w.sim, () => w.brain.mode === 'patrol', 2400), 'the Scout should give up').toBeGreaterThan(0);
    expect(view(w.sim, LIGHT).you!.spotted).toBe(false);
  });

  it('a hero walking the hedged ford lane past the road is not noticed from the square', () => {
    const w = world(5, mapId);
    post(w.scout, -58, 11.6, -1, 0); // on the road, looking west along it, 12 m from the lane mouth
    place(w.hero, -70.3, 5);
    step(w.sim, [cmd(LIGHT, { type: 'moveTo', x: -65, z: -18 })]);
    run(w.sim, 240, () => expect(w.brain.targets.find((t) => t.actorId === w.hero.id)?.attention ?? 0).toBe(0));
    expect(w.hero.z).toBeLessThan(-10); // it crossed the river while unseen
  });

  it('a Light client is never sent the Scout it cannot see, nor any Dark evidence', () => {
    const w = world(9, mapId);
    place(w.hero, -80, 12);
    run(w.sim, 60);
    const snap = view(w.sim, LIGHT);
    expect(snap.actors.some((a) => a.kind === 'monster')).toBe(false);
    expect(snap.evidence).toEqual([]);
    expect(JSON.stringify(snap)).not.toContain('"mode"');
  });

  it('is deterministic: same seed, same commands, same state hash', () => {
    const runOnce = () => {
      const sim = createSim({ seed: 42, mapId });
      occupySlot(sim, 0, 'human');
      occupySlot(sim, 4, 'human');
      step(sim, [cmd(4, { type: 'moveTo', x: 60, z: 16 }), cmd(0, { type: 'moveTo', x: 0, z: -30 })]);
      for (let i = 0; i < 900; i++) step(sim, []);
      return hashState(sim);
    };
    expect(runOnce()).toBe(runOnce());
  });

  it('a hero pushed along a turned wall slides and never ends up inside a collider', () => {
    const w = world(1, mapId);
    place(w.hero, 28, 12.5);
    // Hold a direction into the rotated cottage and its fence for five seconds.
    step(w.sim, [cmd(LIGHT, { type: 'moveDir', dx: 0.2, dz: 1 })]);
    run(w.sim, 150, () => expect(isBlocked(MAP, w.hero.x, w.hero.z, HERO - 0.01)).toBe(false));
    expect(w.hero.z).toBeGreaterThan(13);
  });
});

describe('the spatial index answers exactly like a full scan', () => {
  // Split the props into groups small enough to be scanned linearly, and
  // compare every query with the OR of the groups.
  const groups: MapDef[] = [];
  for (let i = 0; i < MAP.props.length; i += 40) groups.push({ ...MAP, id: `ov_part_${i}`, props: MAP.props.slice(i, i + 40) });
  let seed = 99;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const rx = () => B.minX + rand() * (B.maxX - B.minX);
  const rz = () => B.minZ + rand() * (B.maxZ - B.minZ);

  it('for 4000 random point, segment and sight queries', () => {
    for (let k = 0; k < 4000; k++) {
      const ax = rx(), az = rz();
      const len = rand() < 0.5 ? 6 : 60;
      const bx = Math.min(Math.max(ax + (rand() - 0.5) * len, B.minX), B.maxX);
      const bz = Math.min(Math.max(az + (rand() - 0.5) * len, B.minZ), B.maxZ);
      const r = rand() < 0.5 ? 0.5 : 1.0;
      expect(isBlocked(MAP, ax, az, r)).toBe(groups.some((g) => isBlocked(g, ax, az, r)));
      expect(segmentWalkable(MAP, ax, az, bx, bz, r)).toBe(groups.every((g) => segmentWalkable(g, ax, az, bx, bz, r)));
      expect(sightBlocked(MAP, ax, az, bx, bz)).toBe(groups.some((g) => sightBlocked(g, ax, az, bx, bz)));
    }
  });
});

describe('authoring kit stability', () => {
  it('an orchard row is planted the same whatever unrelated randomness came before it', async () => {
    const { RegionBuilder } = await import('../src/shared/world/kit.ts');
    const plant = (extraDraws: number) => {
      const b = new RegionBuilder({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, 7);
      for (let i = 0; i < extraDraws; i++) b.random();
      b.orchardRow(-30, 0, 30, 0, 4.7);
      return b.props.map((p) => [p.kind, p.x.toFixed(3), p.z.toFixed(3)].join(' '));
    };
    expect(plant(0)).toEqual(plant(17));
    expect(plant(0).length).toBeGreaterThan(8);
  });
});
