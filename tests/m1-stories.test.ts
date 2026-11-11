/**
 * The acceptance stories from docs/design/hunting-perception-v1-playtest-spec.md,
 * as seeded, scripted simulation runs on the real crossing map. M1-09 (two real
 * clients, raw payloads) lives in server.integration.test.ts.
 *
 * Numbers such as detection time are playtest proposals (see tuning.ts). The
 * tests assert the RULES; where they need a number they read it from TUNING.
 */
import { describe, expect, it } from 'vitest';
import { exposure } from '../src/shared/sim/geometry.ts';
import { FOREST_CROSSING as MAP, FOREST_CROSSING_BRUTE } from '../src/shared/sim/map.ts';
import { monsterExposure } from '../src/shared/sim/perception.ts';
import { cloneState, hashState, step } from '../src/shared/sim/simulation.ts';
import { TUNING } from '../src/shared/sim/tuning.ts';
import { DARK_MATE, DARK_OWNER, LIGHT, cmd, place, post, run, runUntil, view, world, type World } from './helpers.ts';

const P = TUNING.perception;
const B = TUNING.behaviour;
const pine = MAP.props.find((p) => p.kind === 'tree_pine' && p.x === 6)!;
const pineR = pine.collider.shape === 'circle' ? pine.collider.radius : 0;

const attention = (w: World) => w.brain.targets.find((t) => t.actorId === w.hero.id)?.attention ?? 0;
const sightings = (w: World) => w.sim.evidence.filter((e) => e.kind === 'sighting');

/** Scout on guard north of the pine, looking south at it from 8 m. */
function scoutWatchingPine(seed = 1): World {
  const w = world(seed);
  post(w.scout, pine.x, pine.z - 8, 0, 1);
  return w;
}

/** Stand the hero in the open in front of a posted Scout until it is confirmed. */
function confirmedChase(seed = 1): World {
  const w = world(seed);
  post(w.scout, -9, 12, 0, -1); // south of the house, looking north
  place(w.hero, -4.5, -1); // in the open by the house's south-east corner, near the edge of its range
  expect(runUntil(w.sim, () => w.brain.mode === 'chase', 400)).toBeGreaterThan(0);
  return w;
}

/**
 * A real escape: run north past the east wall of the house, turn behind it
 * (line of sight breaks there), and keep running west out of view.
 * Returns the tick at which the Scout lost sight.
 */
function escapeBehindHouse(w: World): number {
  step(w.sim, [cmd(LIGHT, { type: 'moveTo', x: -10, z: -9.5 })]);
  expect(runUntil(w.sim, () => w.brain.lostTicks > 0, 300), 'scout should lose sight').toBeGreaterThan(0);
  const lostTick = w.sim.tick;
  runUntil(w.sim, () => w.hero.intent.type === 'idle', 300);
  step(w.sim, [cmd(LIGHT, { type: 'moveTo', x: -22, z: -9 })]);
  runUntil(w.sim, () => w.hero.intent.type === 'idle', 300);
  return lostTick;
}

describe('M1-01 cover: a hero behind a solid tree is not detected', () => {
  it('ten seconds directly behind the pine: no attention, no evidence, Scout stays on its post', () => {
    const w = scoutWatchingPine();
    place(w.hero, pine.x, pine.z + pineR + w.hero.radius + 0.05);
    expect(exposure(MAP, w.scout.x, w.scout.z, w.hero.x, w.hero.z, w.hero.radius)).toBe(0);
    run(w.sim, 300, () => {
      expect(attention(w)).toBe(0);
      expect(w.brain.mode).toBe('patrol');
    });
    expect(w.sim.evidence).toEqual([]);
    expect(view(w.sim, LIGHT).you!.attention).toBe(0);
  });

  it('control: the same spot three metres to the side (no tree in between) is confirmed', () => {
    const w = scoutWatchingPine();
    place(w.hero, pine.x + 3, pine.z + pineR + w.hero.radius + 0.05);
    expect(runUntil(w.sim, () => w.brain.mode === 'chase', 300)).toBeGreaterThan(0);
    expect(sightings(w)).toHaveLength(1);
  });

  it('half behind the tree counts as partly exposed and is noticed more slowly', () => {
    const time = (offset: number) => {
      const w = scoutWatchingPine();
      w.brain.assignment = { type: 'guard', x: w.scout.x, z: w.scout.z };
      place(w.hero, pine.x + offset, pine.z + pineR + w.hero.radius + 0.05);
      const seen = monsterExposure(MAP, w.scout, 'scout', w.hero);
      return { seen, ticks: runUntil(w.sim, () => attention(w) >= P.suspiciousAt, 600) };
    };
    const open = time(3);
    const partial = time(0.75);
    expect(open.seen).toBe(1);
    expect(partial.seen).toBeGreaterThan(0);
    expect(partial.seen).toBeLessThan(1);
    expect(partial.ticks).toBeGreaterThan(open.ticks);
  });

  it('sight needs range and view arc as well as a clear line', () => {
    const w = world();
    place(w.scout, 0, 0, 0, 1); // facing south
    const seenAt = (x: number, z: number) => {
      place(w.hero, x, z);
      return monsterExposure(MAP, w.scout, 'scout', w.hero) > 0;
    };
    const range = TUNING.monsters.scout.viewRange;
    expect(seenAt(-2.5, 8)).toBe(true); // in front, in range
    expect(seenAt(-2.5, range + 6)).toBe(false); // in front, too far
    expect(seenAt(-8, -6)).toBe(false); // behind its back
    expect(seenAt(0.6, -1.4)).toBe(true); // behind, but close enough to sense
  });
});

describe('M1-02 brief exposure: attention starts, then decays', () => {
  it('a dash across the gap in the south belt raises attention without a sighting', () => {
    const w = world();
    post(w.scout, -1, 3, 0, 1); // on the road, looking south at the gap, 12 m away
    w.brain.waitTicks = 9999; // hold its gaze steady for this test
    w.brain.waitTotal = 1e9;
    place(w.hero, -5, 15.5); // behind the thicket
    expect(monsterExposure(MAP, w.scout, 'scout', w.hero)).toBe(0);
    step(w.sim, [cmd(LIGHT, { type: 'moveTo', x: 5, z: 15.5 })]); // to behind the ruined wall
    let peak = 0;
    let exposedTicks = 0;
    runUntil(w.sim, () => w.hero.intent.type === 'idle', 120, () => {
      peak = Math.max(peak, attention(w));
      if (w.brain.targets[0]?.visible) exposedTicks++;
    });
    expect(monsterExposure(MAP, w.scout, 'scout', w.hero)).toBe(0); // in cover again
    expect(exposedTicks).toBeGreaterThan(5);
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThan(1);
    expect(view(w.sim, LIGHT).you!.attention).toBeGreaterThan(0);

    // Staying in cover: attention drains at the decay rate and reaches zero.
    const before = attention(w);
    run(w.sim, 30);
    expect(attention(w)).toBeCloseTo(Math.max(0, before - 30 / P.decayTicks), 6);
    run(w.sim, P.decayTicks);
    expect(attention(w)).toBe(0);
    expect(w.brain.targets).toEqual([]);
    expect(sightings(w)).toEqual([]);
    expect(view(w.sim, LIGHT).you).toMatchObject({ attention: 0, spotted: false });
  });

  it('lingering in view long enough to be glimpsed draws the Scout to that spot, still without a sighting', () => {
    const w = world();
    post(w.scout, -1, 3, 0, 1);
    place(w.hero, 0, 15.5); // standing in the gap
    expect(runUntil(w.sim, () => w.brain.mode === 'investigate', 200)).toBeGreaterThan(0);
    const glimpse = w.sim.evidence.find((e) => e.kind === 'glimpse')!;
    expect(glimpse).toMatchObject({ subject: null, shared: false, ownerSlot: DARK_OWNER });
    expect(w.sim.events.some((e) => e.kind === 'growl')).toBe(true);
    // Back into cover and well away before attention fills.
    place(w.hero, -20, 16);
    const frozen = { x: glimpse.x, z: glimpse.z };
    expect(runUntil(w.sim, () => w.brain.investigate?.phase === 'look', 400)).toBeGreaterThan(0);
    expect(Math.hypot(w.scout.x - frozen.x, w.scout.z - frozen.z)).toBeLessThan(1);
    expect({ x: glimpse.x, z: glimpse.z }).toEqual(frozen);
    expect(runUntil(w.sim, () => w.brain.mode === 'patrol', 900)).toBeGreaterThan(0);
    expect(sightings(w)).toEqual([]);
  });
});

describe('M1-03 sustained exposure: confirmation, reaction, timestamped evidence', () => {
  it('confirms after the tuned build-up, howls, chases and files one shared alert', () => {
    const w = world();
    post(w.scout, -9, 8, 0, -1);
    place(w.hero, -3, 1);
    const ticks = runUntil(w.sim, () => w.brain.mode === 'chase', 300);
    // Never instant, never slower than the far-range rate allows.
    expect(ticks).toBeGreaterThanOrEqual(P.detectTicksClose);
    expect(ticks).toBeLessThanOrEqual(Math.ceil(P.detectTicksClose / P.farRateFactor) + B.noticeTicks + 30);
    expect(w.sim.events.filter((e) => e.kind === 'howl')).toHaveLength(1);
    const [alert] = sightings(w);
    expect(sightings(w)).toHaveLength(1);
    expect(alert).toMatchObject({ kind: 'sighting', shared: true, source: w.scout.id, subject: w.hero.id, x: w.hero.x, z: w.hero.z, tick: w.sim.tick - 1 });

    // Authorised recipients: every Dark seat gets the alert, with its time.
    for (const slot of [DARK_OWNER, DARK_MATE]) {
      expect(view(w.sim, slot).evidence).toContainEqual({ id: alert!.id, kind: 'sighting', x: alert!.x, z: alert!.z, tick: alert!.tick, source: w.scout.id, subject: w.hero.id });
    }
    expect(view(w.sim, LIGHT).evidence).toEqual([]);
    expect(view(w.sim, null).evidence).toEqual([]);
    // The hero's own feedback is distinct once confirmed.
    expect(view(w.sim, LIGHT).you).toMatchObject({ attention: 1, spotted: true });
  });

  it('staying in view does not produce a stream of alerts', () => {
    const w = confirmedChase();
    step(w.sim, [cmd(LIGHT, { type: 'moveDir', dx: 1, dz: 0 })]);
    run(w.sim, 200);
    expect(sightings(w)).toHaveLength(1);
  });
});

/** Escape behind the house, then go one of several hidden ways. */
function loseTheScout(hiddenMove: { x: number; z: number }): { w: World; lostTick: number; trace: string[]; seenAgain: number } {
  const w = confirmedChase(11);
  const lostTick = escapeBehindHouse(w);
  step(w.sim, [cmd(LIGHT, { type: 'moveTo', ...hiddenMove })]);
  const trace: string[] = [];
  let seenAgain = 0;
  run(w.sim, 1500, () => {
    if (w.brain.targets.some((t) => t.visible)) seenAgain++;
    trace.push(`${w.scout.x},${w.scout.z},${w.scout.dirX},${w.scout.dirZ},${w.brain.mode}`);
  });
  return { w, lostTick, trace, seenAgain };
}

describe('M1-04 breaking sight: the Scout searches what it last saw, never the truth', () => {
  it('goes to the last seen position, searches near it, and its last-seen record stops at the moment sight broke', () => {
    const w = confirmedChase(11);
    step(w.sim, [cmd(LIGHT, { type: 'moveTo', x: -10, z: -9.5 })]);
    expect(runUntil(w.sim, () => w.brain.lostTicks > 0, 300)).toBeGreaterThan(0);
    const seen = { ...w.brain.lastSeen! };
    // What it remembers is where the hero WAS on the last tick it was seen.
    expect(seen.tick).toBeLessThan(w.sim.tick);
    expect(w.sim.evidence.find((e) => e.kind === 'lastSeen')).toMatchObject({ x: seen.x, z: seen.z, shared: false, ownerSlot: DARK_OWNER });

    // Keep running: behind the house, then double back south-west.
    runUntil(w.sim, () => w.hero.intent.type === 'idle', 300);
    step(w.sim, [cmd(LIGHT, { type: 'moveTo', x: -22, z: -9 })]);
    let reachedLastSeen = false;
    let doubledBack = false;
    expect(runUntil(w.sim, () => w.brain.mode === 'search', 600, () => {
      expect(w.brain.lastSeen).toEqual(seen); // frozen while unseen
      if (Math.hypot(w.scout.x - seen.x, w.scout.z - seen.z) < 0.6) reachedLastSeen = true;
      if (!doubledBack && w.hero.intent.type === 'idle') {
        doubledBack = true;
      }
    })).toBeGreaterThan(0);
    expect(reachedLastSeen).toBe(true);
    step(w.sim, [cmd(LIGHT, { type: 'moveTo', x: -25, z: 6 })]);

    // Every search point is a guess around the last seen position...
    const points = w.brain.search!.points;
    expect(points).toHaveLength(B.searchPoints);
    for (const p of points) expect(Math.hypot(p.x - seen.x, p.z - seen.z)).toBeLessThanOrEqual(B.searchRadius * 1.5 + 1);
    // ...and none of them is where the hero actually is.
    run(w.sim, 300, () => {
      expect(w.brain.targets.every((t) => !t.visible)).toBe(true);
      for (const p of points) expect(Math.hypot(p.x - w.hero.x, p.z - w.hero.z)).toBeGreaterThan(5);
    });
  });

  it('non-interference: while the hero stays unseen, the Scout behaves identically wherever the hero really is', () => {
    const a = loseTheScout({ x: -24, z: -20 }); // carries on north-west
    const b = loseTheScout({ x: -25, z: 6 }); // doubles back south
    const c = loseTheScout({ x: -22, z: -9 }); // stops and waits
    expect(a.lostTick).toBe(b.lostTick);
    // The heroes really did end up far apart...
    expect(Math.hypot(a.w.hero.x - b.w.hero.x, a.w.hero.z - b.w.hero.z)).toBeGreaterThan(20);
    // ...and none was seen again...
    expect([a.seenAgain, b.seenAgain, c.seenAgain]).toEqual([0, 0, 0]);
    // ...so every tick of the Scout's movement, facing and state is the same.
    expect(a.trace).toEqual(b.trace);
    expect(a.trace).toEqual(c.trace);
    expect(a.w.sim.rng).toBe(b.w.sim.rng);
    // It did search, around where it last saw the hero, and then went home.
    expect(a.trace.map((t) => t.split(',')[4]).filter((m, i, all) => m !== all[i - 1])).toEqual(['search', 'return', 'patrol']);
  });

  it('an escape that walks back into view is found again: cover has to be real', () => {
    const w = confirmedChase(11);
    escapeBehindHouse(w);
    // Sneak back to the side of the house while the Scout is still searching there.
    step(w.sim, [cmd(LIGHT, { type: 'setGait', sneak: true }), cmd(LIGHT, { type: 'moveTo', x: -14, z: -3 })]);
    expect(runUntil(w.sim, () => w.brain.mode === 'chase', 1500)).toBeGreaterThan(0);
  });
});

describe('M1-05 noise: investigated as a place, not as a person', () => {
  it('a whistle from behind the wall draws the Scout to roughly that spot and identifies nobody', () => {
    const w = world(5);
    post(w.scout, 0, 5, 0, -1); // on the road, looking north, away from the wall
    place(w.hero, 5.5, 15); // south of the ruined wall
    expect(monsterExposure(MAP, w.scout, 'scout', w.hero)).toBe(0);
    const origin = { x: w.hero.x, z: w.hero.z };
    step(w.sim, [cmd(LIGHT, { type: 'whistle' })]);
    expect(w.brain.mode).toBe('investigate');
    expect(w.brain.investigate!.kind).toBe('noise');
    expect(w.brain.targets).toEqual([]); // it knows of no hero at all

    const noise = w.sim.evidence.find((e) => e.kind === 'noise')!;
    const d = Math.hypot(w.scout.x - origin.x, w.scout.z - origin.z);
    const maxError = (P.noiseErrorBase + d * P.noiseErrorPerMetre) * Math.SQRT2;
    const error = Math.hypot(noise.x - origin.x, noise.z - origin.z);
    expect(error).toBeGreaterThan(0); // approximate...
    expect(error).toBeLessThanOrEqual(maxError); // ...within the stated error
    expect(noise).toMatchObject({ subject: null, shared: false, ownerSlot: DARK_OWNER });
    // Owner sees a noise report with no subject; nobody else is told anything.
    expect(view(w.sim, DARK_OWNER).evidence).toEqual([{ id: noise.id, kind: 'noise', x: noise.x, z: noise.z, tick: noise.tick, source: w.scout.id }]);
    expect(view(w.sim, DARK_MATE).evidence).toEqual([]);

    // Misdirection: the hero sneaks off; the lead stays where the sound was.
    step(w.sim, [cmd(LIGHT, { type: 'setGait', sneak: true }), cmd(LIGHT, { type: 'moveTo', x: 19, z: 16 })]);
    const lead = { x: noise.x, z: noise.z };
    expect(runUntil(w.sim, () => w.brain.investigate?.phase === 'look', 600, () => {
      if (w.brain.investigate) expect({ x: w.brain.investigate.x, z: w.brain.investigate.z }).toEqual(lead);
    })).toBeGreaterThan(0);
    expect(Math.hypot(w.scout.x - lead.x, w.scout.z - lead.z)).toBeLessThan(1.5);
    expect(sightings(w)).toEqual([]);
  });

  it('running is heard nearby, sneaking is not, and whistling has a cooldown', () => {
    const near = TUNING.hero.runNoiseRadius - 1.5;
    const heard = (sneak: boolean) => {
      const w = world(5);
      post(w.scout, 0, 5, 0, -1);
      w.brain.waitTicks = 9999;
      w.brain.waitTotal = 1e9;
      place(w.hero, -2, 5 + near); // behind its back, out of its proximity sense
      step(w.sim, [cmd(LIGHT, { type: 'setGait', sneak }), cmd(LIGHT, { type: 'moveDir', dx: 1, dz: 0 })]);
      run(w.sim, 25);
      return w.sim.evidence.some((e) => e.kind === 'noise');
    };
    expect(heard(false)).toBe(true);
    expect(heard(true)).toBe(false);

    const w = world(5);
    place(w.hero, 0, 20);
    step(w.sim, [cmd(LIGHT, { type: 'whistle' })]);
    step(w.sim, [cmd(LIGHT, { type: 'whistle' })]);
    expect(w.sim.events.filter((e) => e.kind === 'whistle')).toHaveLength(0); // second one refused
    expect(view(w.sim, LIGHT).you!.whistleCooldown).toBe(TUNING.hero.whistleCooldownTicks - 2);
  });
});

describe('M1-06 commander agency: the owner can move the patrol to a resource', () => {
  const site = MAP.sites[1]!;

  it('an order from the owner sends the Scout to guard the cache; a later order restores the patrol', () => {
    const w = world();
    run(w.sim, 60);
    step(w.sim, [cmd(DARK_OWNER, { type: 'monsterOrder', actorId: w.scout.id, order: 'guard', x: site.x, z: site.z })]);
    expect(w.brain.mode).toBe('return'); // visibly changed priority at once
    expect(view(w.sim, DARK_OWNER).actors.find((a) => a.id === w.scout.id)).toMatchObject({ mode: 'return', order: { x: site.x, z: site.z } });
    expect(runUntil(w.sim, () => w.brain.mode === 'patrol', 1200)).toBeGreaterThan(0);
    expect(Math.hypot(w.scout.x - site.x, w.scout.z - site.z)).toBeLessThan(0.1);
    // It stays and watches.
    run(w.sim, 300);
    expect(Math.hypot(w.scout.x - site.x, w.scout.z - site.z)).toBeLessThan(0.1);
    // A hero who comes for the cache now is caught by the guard.
    place(w.hero, w.scout.x + w.scout.dirX * 4, w.scout.z + w.scout.dirZ * 4);
    expect(runUntil(w.sim, () => w.brain.mode === 'chase', 400)).toBeGreaterThan(0);

    // The hero gets away; the commander sends the Scout back to its route.
    // (An order does not blind a monster: with the hero still in front of it,
    // it would simply confirm and chase again.)
    place(w.hero, 0, 27);
    run(w.sim, 1);
    step(w.sim, [cmd(DARK_OWNER, { type: 'monsterOrder', actorId: w.scout.id, order: 'patrol' })]);
    expect(runUntil(w.sim, () => w.brain.mode === 'patrol' && w.brain.assignment.type === 'patrol', 1500)).toBeGreaterThan(0);
    const route = MAP.patrolRoutes[0]!;
    expect(route.some((p) => Math.hypot(p.x - w.scout.x, p.z - w.scout.z) < 0.1)).toBe(true);
  });

  it('orders from a Dark teammate, a Light player or for a non-monster are ignored', () => {
    const w = world();
    run(w.sim, 60);
    const before = hashState(cloneState(w.sim));
    const order = { type: 'monsterOrder', actorId: w.scout.id, order: 'guard', x: site.x, z: site.z } as const;
    const twin = cloneState(w.sim);
    step(w.sim, [cmd(DARK_MATE, order), cmd(LIGHT, order), cmd(DARK_OWNER, { ...order, actorId: w.hero.id })]);
    step(twin, []);
    expect(hashState(w.sim)).toBe(hashState(twin));
    expect(hashState(w.sim)).not.toBe(before);
    expect(w.brain.assignment.type).toBe('patrol');
  });
});

describe('M1-07 a Brute answers the alert but gets no tracking', () => {
  function bruteWorld(hiddenMove: { x: number; z: number }) {
    const w = world(3, FOREST_CROSSING_BRUTE.id);
    const brute = w.sim.actors.find((a) => a.brain?.type === 'brute')!;
    post(w.scout, -9, 12, 0, -1);
    place(w.hero, -4.5, -1);
    expect(runUntil(w.sim, () => w.brain.mode === 'chase', 400)).toBeGreaterThan(0);
    const alert = w.sim.evidence.find((e) => e.kind === 'sighting')!;
    // The hero escapes behind the house and then moves on.
    escapeBehindHouse(w);
    step(w.sim, [cmd(LIGHT, { type: 'moveTo', ...hiddenMove })]);
    return { w, brute, alert };
  }

  it('walks to the alert position (frozen at confirmation), looks, and returns to its post', () => {
    const { w, brute, alert } = bruteWorld({ x: -24, z: -20 });
    const b = brute.brain!;
    expect(b.mode).toBe('investigate');
    expect(b.investigate).toMatchObject({ kind: 'alert', x: alert.x, z: alert.z });
    expect(b.targets).toEqual([]);
    let nearest = Infinity;
    expect(runUntil(w.sim, () => b.mode === 'return', 2400, () => {
      if (b.investigate) expect({ x: b.investigate.x, z: b.investigate.z }).toEqual({ x: alert.x, z: alert.z });
      nearest = Math.min(nearest, Math.hypot(brute.x - alert.x, brute.z - alert.z));
    })).toBeGreaterThan(0);
    expect(nearest).toBeLessThan(0.1);
    expect(runUntil(w.sim, () => b.mode === 'patrol', 2400)).toBeGreaterThan(0);
    const postAt = FOREST_CROSSING_BRUTE.monsters[1]!.post!;
    expect(Math.hypot(brute.x - postAt.x, brute.z - postAt.z)).toBeLessThan(0.1);
  });

  it('non-interference: the Brute moves identically wherever the unseen hero goes', () => {
    const trace = (move: { x: number; z: number }) => {
      const { w, brute } = bruteWorld(move);
      const out: string[] = [];
      let seen = false;
      run(w.sim, 900, () => {
        out.push(`${brute.x},${brute.z},${brute.dirX},${brute.dirZ},${brute.brain!.mode}`);
        if (brute.brain!.targets.some((t) => t.visible)) seen = true;
      });
      return { out, seen, hero: { x: w.hero.x, z: w.hero.z } };
    };
    const a = trace({ x: -24, z: -20 });
    const b = trace({ x: -25, z: 6 });
    expect(a.seen || b.seen).toBe(false);
    expect(Math.hypot(a.hero.x - b.hero.x, a.hero.z - b.hero.z)).toBeGreaterThan(10);
    expect(a.out).toEqual(b.out);
  });
});

describe('M1-08 pursuit is finite', () => {
  it('after losing the hero the Scout searches, gives up, returns and patrols again', () => {
    const { w, lostTick } = loseTheScout({ x: -24, z: -20 });
    // loseTheScout ran 1500 ticks after sight broke: long over by now.
    expect(w.brain.mode).toBe('patrol');
    expect(w.brain.chaseId).toBeNull();
    expect(w.brain.search).toBeNull();
    expect(w.brain.targets).toEqual([]);
    expect(w.scout.speed).toBe(TUNING.monsters.scout.walkSpeed);
    expect(lostTick).toBeGreaterThan(0);

    // Bounded: lost-walk, search and the walk home each have a hard cap.
    const fresh = loseTheScout({ x: -24, z: -20 });
    const modes = fresh.trace.map((t) => t.split(',')[4]);
    const backOnPatrol = modes.indexOf('patrol');
    expect(backOnPatrol).toBeGreaterThan(0);
    expect(backOnPatrol).toBeLessThan(B.lostTimeoutTicks + B.searchMaxTicks + 600);
    expect(modes.slice(0, backOnPatrol).filter((m, i, all) => m !== all[i - 1])).toEqual(['search', 'return']);

    // And it really is back on its assignment (here: the guard post it was
    // given), calm, scanning, and not wedged anywhere on the way.
    expect(Math.hypot(w.scout.x + 9, w.scout.z - 12)).toBeLessThan(1); // the nearest standable spot to its post
    const facings = new Set<string>();
    run(w.sim, 300, () => {
      facings.add(w.scout.dirX.toFixed(1));
      expect(w.brain.mode).toBe('patrol');
      expect(w.scout.stuckTicks).toBe(0);
    });
    expect(facings.size).toBeGreaterThan(3);
  });

  it('seeing the hero again during the search is fresh evidence: a new chase, and a new alert only after the cooldown', () => {
    const w = confirmedChase(11);
    escapeBehindHouse(w);
    expect(runUntil(w.sim, () => w.brain.mode === 'search', 900)).toBeGreaterThanOrEqual(0);
    expect(sightings(w)).toHaveLength(1);
    const first = sightings(w)[0]!;
    // Step out in front of it.
    place(w.hero, w.scout.x + w.scout.dirX * 3, w.scout.z + w.scout.dirZ * 3);
    expect(monsterExposure(MAP, w.scout, 'scout', w.hero)).toBeGreaterThan(0);
    expect(runUntil(w.sim, () => w.brain.mode === 'chase', 200)).toBeGreaterThan(0);
    expect(w.sim.tick - first.tick).toBeGreaterThan(P.alertCooldownTicks);
    expect(sightings(w)).toHaveLength(2);
    expect(sightings(w)[1]!.tick).toBeGreaterThan(first.tick);
  });
});

describe('M1-10 determinism of AI states, reports and observations', () => {
  function scripted(seed: number) {
    const w = world(seed, FOREST_CROSSING_BRUTE.id);
    const script: Record<number, ReturnType<typeof cmd>[]> = {
      5: [cmd(LIGHT, { type: 'moveTo', x: -21, z: 3 })],
      200: [cmd(LIGHT, { type: 'whistle' })],
      260: [cmd(LIGHT, { type: 'moveTo', x: 0, z: 2 })],
      300: [cmd(DARK_OWNER, { type: 'moveTo', x: 4, z: -12 })],
      520: [cmd(LIGHT, { type: 'moveTo', x: 20, z: -2 })],
      700: [cmd(DARK_OWNER, { type: 'monsterOrder', actorId: w.scout.id, order: 'guard', x: 20, z: -2 })],
      820: [cmd(LIGHT, { type: 'setGait', sneak: true }), cmd(LIGHT, { type: 'moveDir', dx: -1, dz: 1 })],
      1100: [cmd(DARK_OWNER, { type: 'monsterOrder', actorId: w.scout.id, order: 'patrol' })],
    };
    const log: string[] = [];
    const hashes: string[] = [];
    let mode = '';
    let evidence = 0;
    for (let i = 0; i < 1500; i++) {
      step(w.sim, script[w.sim.tick] ?? []);
      if (w.brain.mode !== mode) log.push(`${w.sim.tick} scout ${(mode = w.brain.mode)}`);
      for (const e of w.sim.evidence.slice(evidence)) log.push(`${e.tick} ${e.kind} ${e.x},${e.z}`);
      evidence = w.sim.evidence.length;
      if (i % 50 === 0) hashes.push(hashState(w.sim));
    }
    return { log, hashes, final: hashState(w.sim), dark: JSON.stringify(view(w.sim, DARK_OWNER)) };
  }

  it('same seed and script: same AI states, same evidence at the same ticks, same projections', () => {
    const a = scripted(2026);
    const b = scripted(2026);
    expect(a.log.length).toBeGreaterThan(6); // the script really exercises the AI
    expect(a.log.some((l) => l.includes('sighting'))).toBe(true);
    expect(a.log.some((l) => l.includes('noise'))).toBe(true);
    expect(a.log).toEqual(b.log);
    expect(a.hashes).toEqual(b.hashes);
    expect(a.final).toBe(b.final);
    expect(a.dark).toBe(b.dark);
  });

  it('a different seed diverges', () => {
    expect(scripted(2026).final).not.toBe(scripted(2027).final);
  });
});

describe('D-013 one stealth rule set, per-class modifiers', () => {
  it('cover works identically for every profile; only build-up speed and loudness differ', () => {
    const confirmTicks = (profile: string, behindTree: boolean) => {
      const w = world(1, MAP.id, profile);
      post(w.scout, pine.x, pine.z - 8, 0, 1);
      w.brain.waitTicks = 9999;
      w.brain.waitTotal = 1e9;
      place(w.hero, pine.x + (behindTree ? 0 : 3), pine.z + pineR + w.hero.radius + 0.05);
      const seen = monsterExposure(MAP, w.scout, 'scout', w.hero);
      return { seen, ticks: runUntil(w.sim, () => w.brain.mode === 'chase', 600) };
    };
    // Obstruction is not a modifier: nobody is seen through the tree.
    for (const profile of ['default', 'goblin', 'knight']) {
      expect(confirmTicks(profile, true)).toEqual({ seen: 0, ticks: -1 });
      expect(confirmTicks(profile, false).seen).toBe(1);
    }
    const goblin = confirmTicks('goblin', false).ticks;
    const plain = confirmTicks('default', false).ticks;
    const knight = confirmTicks('knight', false).ticks;
    expect(goblin).toBeGreaterThan(plain);
    expect(plain).toBeGreaterThan(knight);

    const heardAt = (profile: string, d: number) => {
      const w = world(1, MAP.id, profile);
      post(w.scout, 0, 5, 0, -1);
      place(w.hero, -2, 5 + d);
      step(w.sim, [cmd(LIGHT, { type: 'moveDir', dx: 1, dz: 0 })]);
      run(w.sim, 15);
      return w.sim.evidence.some((e) => e.kind === 'noise');
    };
    const between = TUNING.hero.runNoiseRadius * 1.2; // too far for normal feet, not for armour
    expect(heardAt('default', between)).toBe(false);
    expect(heardAt('knight', between)).toBe(true);
    expect(heardAt('goblin', TUNING.hero.runNoiseRadius * 0.85)).toBe(false);
  });
});
