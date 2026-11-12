/**
 * Issue #6 step 7: the crossing must offer a visibly risky direct path and a
 * covered indirect one. These tests measure that on the real geometry.
 */
import { describe, expect, it } from 'vitest';
import { exposure, isBlocked } from '../src/shared/sim/geometry.ts';
import { FOREST_CROSSING as MAP, type Point } from '../src/shared/sim/map.ts';
import { findPath, pathLength } from '../src/shared/sim/nav.ts';
import { HERO_RADIUS, MONSTER_RADIUS } from '../src/shared/sim/simulation.ts';
import { TUNING } from '../src/shared/sim/tuning.ts';

const west: Point = MAP.sites[0]!;
const east: Point = MAP.sites[1]!;
const range = TUNING.monsters.scout.viewRange;

/** Points every half metre along the Scout's patrol loop. */
const patrol: Point[] = [];
{
  const route = MAP.patrolRoutes[0]!;
  route.forEach((a, i) => {
    const b = route[(i + 1) % route.length]!;
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
    for (let k = 0; k < n; k++) patrol.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  });
}

/** Could the Scout see this spot from anywhere on its patrol (ignoring which way it faces)? */
function watched(p: Point): boolean {
  return patrol.some((s) => Math.hypot(s.x - p.x, s.z - p.z) <= range && exposure(MAP, s.x, s.z, p.x, p.z, HERO_RADIUS) > 0);
}

function walk(via: Point[]): { length: number; watchedLength: number; longestWatched: number } {
  const points: Point[] = [via[0]!];
  for (const next of via.slice(1)) points.push(...findPath(MAP, HERO_RADIUS, points.at(-1)!, next)!);
  let length = 0;
  let watchedLength = 0;
  let run = 0;
  let longestWatched = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(d / 0.25));
    for (let k = 0; k < n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n };
      length += d / n;
      if (watched(p)) {
        watchedLength += d / n;
        run += d / n;
        longestWatched = Math.max(longestWatched, run);
      } else run = 0;
    }
  }
  return { length, watchedLength, longestWatched };
}

const direct = walk([west, east]);
const south = walk([west, { x: -22, z: 11 }, { x: -17, z: 15.5 }, { x: -4, z: 15.5 }, { x: 3, z: 15.5 }, { x: 13, z: 15 }, { x: 19.5, z: 15.5 }, { x: 22.5, z: 8 }, east]);
const north = walk([west, { x: -21, z: -8 }, { x: -13, z: -10.5 }, { x: -6, z: -16 }, { x: 4, z: -16.5 }, { x: 12, z: -16.5 }, { x: 19, z: -9 }, east]);

describe('the crossing offers a real choice', () => {
  it('the map is well formed', () => {
    for (const site of MAP.sites) expect(isBlocked(MAP, site.x, site.z, HERO_RADIUS)).toBe(false);
    for (const p of MAP.patrolRoutes.flat()) expect(isBlocked(MAP, p.x, p.z, MONSTER_RADIUS)).toBe(false);
    expect(MAP.monsters).toEqual([{ type: 'scout', ownerSlot: 0, route: 0 }]);
    expect(MAP.props.filter((p) => p.blocksSight).length).toBeGreaterThan(15);
    expect(MAP.props.some((p) => !p.blocksSight)).toBe(true); // low rocks: not everything is cover
  });

  it('both caches and both spawns are outside the Scout\'s normal view', () => {
    expect(watched(west)).toBe(false);
    expect(watched(east)).toBe(false);
    for (const spawn of MAP.spawns) expect(watched(spawn)).toBe(false);
  });

  it('the direct route is short and exposed for most of its length', () => {
    expect(direct.length).toBeLessThan(46);
    expect(direct.watchedLength / direct.length).toBeGreaterThan(0.7);
  });

  it('the south route is much longer and covered, apart from one dash across the road gap', () => {
    expect(south.length).toBeGreaterThan(direct.length * 1.4);
    expect(south.watchedLength / south.length).toBeLessThan(0.2);
    // The single exposed stretch can be run in about a second and a half.
    expect(south.longestWatched).toBeGreaterThan(2);
    expect(south.longestWatched / TUNING.hero.speed).toBeLessThan(1.6);
  });

  it('the north route is a third option: more covered than the direct one, more exposed than the south', () => {
    expect(north.watchedLength / north.length).toBeLessThan(direct.watchedLength / direct.length - 0.25);
    expect(north.watchedLength).toBeGreaterThan(south.watchedLength);
  });

  it('there is cover to stop behind in the middle of the direct route', () => {
    const stones = MAP.props.filter((p) => p.kind === 'standing_stone');
    expect(stones.length).toBeGreaterThanOrEqual(2);
    expect(stones.every((s) => s.blocksSight && Math.hypot(s.x, s.z) < 5)).toBe(true);
  });

  it('routes are reachable and the measured lengths are real paths', () => {
    expect(pathLength(west, findPath(MAP, HERO_RADIUS, west, east)!)).toBeCloseTo(direct.length, 0);
  });
});
