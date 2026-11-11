/**
 * Issue #6 step 1: server-side deterministic routes around blockers for
 * moveTo, monsters and bots, with proof that paths reach meaningful
 * destinations without stalling on walls.
 */
import { describe, expect, it } from 'vitest';
import { isBlocked, segmentWalkable } from '../src/shared/sim/geometry.ts';
import { FOREST_CROSSING as MAP } from '../src/shared/sim/map.ts';
import { findPath, pathLength } from '../src/shared/sim/nav.ts';
import { rngNext } from '../src/shared/sim/rng.ts';
import { HERO_RADIUS, HERO_SPEED, MONSTER_RADIUS, TICK_RATE, actorOfSlot, createSim, occupySlot, step } from '../src/shared/sim/simulation.ts';
import { Match } from '../src/server/match.ts';
import { LIGHT, cmd, place, runUntil, world } from './helpers.ts';

const house = MAP.props.find((p) => p.kind === 'crooked_house')!;
const [west, east] = MAP.sites as [typeof MAP.sites[number], typeof MAP.sites[number]];

/** Seeded list of standable points spread over the map. */
function freePoints(count: number, radius: number, seed = 99): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  let s = seed;
  while (out.length < count) {
    const a = rngNext(s);
    const b = rngNext(a.state);
    s = b.state;
    const x = (a.value * 2 - 1) * (MAP.halfSize - 1);
    const z = (b.value * 2 - 1) * (MAP.halfSize - 1);
    if (!isBlocked(MAP, x, z, radius + 0.1)) out.push({ x, z });
  }
  return out;
}

describe('path planning', () => {
  it('goes straight when nothing is in the way', () => {
    expect(findPath(MAP, HERO_RADIUS, { x: 0, z: 25 }, { x: 8, z: 22 })).toEqual([{ x: 8, z: 22 }]);
  });

  it('routes around the house instead of into it', () => {
    const from = { x: house.x, z: house.z + 8 };
    const to = { x: house.x, z: house.z - 8 };
    const path = findPath(MAP, HERO_RADIUS, from, to)!;
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual(to);
    let prev = from;
    for (const p of path) {
      expect(segmentWalkable(MAP, prev.x, prev.z, p.x, p.z, HERO_RADIUS), `leg to ${p.x},${p.z}`).toBe(true);
      prev = p;
    }
    // A detour, but not a silly one: at most 40% longer than the best possible corner-hugging route.
    const hug = 2 * Math.hypot(house.x + 3.2 + 0.5 - from.x, 8 - 2.6 - 0.5) + 2 * (2.6 + 0.5);
    expect(pathLength(from, path)).toBeLessThan(hug * 1.4);
  });

  it('every leg of every planned path is clear, for heroes and monsters, between 150 random pairs', () => {
    for (const radius of [HERO_RADIUS, MONSTER_RADIUS]) {
      const pts = freePoints(300, radius);
      for (let i = 0; i < 150; i++) {
        const from = pts[i * 2]!;
        const to = pts[i * 2 + 1]!;
        const path = findPath(MAP, radius, from, to);
        expect(path, `no path ${JSON.stringify(from)} -> ${JSON.stringify(to)}`).not.toBeNull();
        expect(path!.at(-1)).toEqual(to);
        let prev = from;
        for (const p of path!) {
          expect(isBlocked(MAP, p.x, p.z, radius)).toBe(false);
          // Legs are planned with a small margin; allow the exact radius here.
          expect(segmentWalkable(MAP, prev.x, prev.z, p.x, p.z, radius - 0.06), `${JSON.stringify(prev)} -> ${JSON.stringify(p)}`).toBe(true);
          prev = p;
        }
      }
    }
  });

  it('a destination inside an obstacle becomes the nearest standable point', () => {
    const path = findPath(MAP, HERO_RADIUS, { x: house.x, z: house.z + 8 }, { x: house.x, z: house.z })!;
    const end = path.at(-1)!;
    expect(isBlocked(MAP, end.x, end.z, HERO_RADIUS)).toBe(false);
    expect(Math.hypot(end.x - house.x, end.z - house.z)).toBeLessThan(4.5);
  });

  it('is deterministic: the same query returns the same path', () => {
    const a = findPath(MAP, HERO_RADIUS, west, east);
    const b = findPath(MAP, HERO_RADIUS, west, east);
    expect(a).toEqual(b);
  });
});

describe('walking the paths (moveTo)', () => {
  it('a hero reaches 60 random destinations in about path-length time, never stalling or clipping', () => {
    const pts = freePoints(120, HERO_RADIUS, 7);
    for (let i = 0; i < 60; i++) {
      const from = pts[i * 2]!;
      const to = pts[i * 2 + 1]!;
      const sim = createSim({ seed: 1, mapId: MAP.id });
      occupySlot(sim, LIGHT, 'human');
      const hero = actorOfSlot(sim, LIGHT)!;
      place(hero, from.x, from.z);
      const planned = pathLength(from, findPath(MAP, HERO_RADIUS, from, to)!);
      step(sim, [cmd(LIGHT, { type: 'moveTo', x: to.x, z: to.z })]);
      let worstStuck = 0;
      const budget = Math.ceil((planned / HERO_SPEED) * TICK_RATE * 1.1) + 15;
      const took = runUntil(sim, () => hero.intent.type === 'idle', budget, () => {
        worstStuck = Math.max(worstStuck, hero.stuckTicks);
        expect(isBlocked(MAP, hero.x, hero.z, HERO_RADIUS)).toBe(false);
      });
      const label = `${JSON.stringify(from)} -> ${JSON.stringify(to)}`;
      expect(took, `timed out: ${label}`).toBeGreaterThanOrEqual(0);
      expect(Math.hypot(hero.x - to.x, hero.z - to.z), label).toBeLessThan(0.06);
      expect(worstStuck, `stalled: ${label}`).toBeLessThan(3);
    }
  });

  it('meaningful destinations: spawn to both caches, cache to cache, and around the house', () => {
    const trips: [{ x: number; z: number }, { x: number; z: number }][] = [
      [MAP.spawns[4]!, west], [MAP.spawns[4]!, east], [west, east], [east, west],
      [{ x: house.x, z: house.z + 8 }, { x: house.x, z: house.z - 8 }],
      [MAP.spawns[0]!, MAP.spawns[4]!],
    ];
    for (const [from, to] of trips) {
      const w = world();
      place(w.hero, from.x, from.z);
      step(w.sim, [cmd(LIGHT, { type: 'moveTo', x: to.x, z: to.z })]);
      const took = runUntil(w.sim, () => w.hero.intent.type === 'idle', TICK_RATE * 30);
      expect(took).toBeGreaterThan(0);
      expect(Math.hypot(w.hero.x - to.x, w.hero.z - to.z)).toBeLessThan(0.06);
    }
  });

  it('a click on the house walks the hero to its wall, not into a stall', () => {
    const w = world();
    place(w.hero, house.x, house.z + 8);
    step(w.sim, [cmd(LIGHT, { type: 'moveTo', x: house.x, z: house.z })]);
    let worstStuck = 0;
    expect(runUntil(w.sim, () => w.hero.intent.type === 'idle', 300, () => (worstStuck = Math.max(worstStuck, w.hero.stuckTicks)))).toBeGreaterThan(0);
    expect(worstStuck).toBeLessThan(3);
    expect(isBlocked(MAP, w.hero.x, w.hero.z, HERO_RADIUS)).toBe(false);
  });
});

describe('monsters and bots use the same navigation', () => {
  it('an ordered Scout walks around cover to both caches without stalling', () => {
    for (const site of [east, west]) {
      const w = world();
      step(w.sim, [cmd(0, { type: 'monsterOrder', actorId: w.scout.id, order: 'guard', x: site.x, z: site.z })]);
      let worstStuck = 0;
      const took = runUntil(w.sim, () => w.brain.mode === 'patrol', TICK_RATE * 40, () => (worstStuck = Math.max(worstStuck, w.scout.stuckTicks)));
      expect(took).toBeGreaterThan(0);
      expect(Math.hypot(w.scout.x - site.x, w.scout.z - site.z)).toBeLessThan(0.1);
      expect(worstStuck).toBeLessThan(3);
    }
  });

  it('eight bots roam for two minutes: all travel, none stays wedged against a blocker', () => {
    const match = new Match({ seed: 2026, mapId: MAP.id, botSlots: [0, 1, 2, 3, 4, 5, 6, 7] });
    const heroes = () => match.inspect().actors.filter((a) => a.kind === 'hero');
    const travelled = new Map<number, number>();
    const last = new Map(heroes().map((h) => [h.id, { x: h.x, z: h.z }]));
    let worstStuck = 0;
    for (let i = 0; i < TICK_RATE * 120; i++) {
      match.advance();
      for (const h of heroes()) {
        const p = last.get(h.id)!;
        travelled.set(h.id, (travelled.get(h.id) ?? 0) + Math.hypot(h.x - p.x, h.z - p.z));
        last.set(h.id, { x: h.x, z: h.z });
        worstStuck = Math.max(worstStuck, h.stuckTicks);
        expect(isBlocked(MAP, h.x, h.z, HERO_RADIUS)).toBe(false);
      }
    }
    expect(travelled.size).toBe(8);
    for (const [id, metres] of travelled) expect(metres, `bot hero ${id}`).toBeGreaterThan(100);
    expect(worstStuck).toBeLessThan(3);
  });
});
