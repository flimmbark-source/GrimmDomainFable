/**
 * Issue #6 step 5 and D-012: what each viewer's snapshot may contain.
 * These tests check the projected payloads themselves, including by scanning
 * the serialised text for coordinates that must not be there.
 */
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../src/shared/protocol.ts';
import { exposure } from '../src/shared/sim/geometry.ts';
import { FOREST_CROSSING as MAP } from '../src/shared/sim/map.ts';
import { step } from '../src/shared/sim/simulation.ts';
import { TUNING } from '../src/shared/sim/tuning.ts';
import { Match } from '../src/server/match.ts';
import { DARK_MATE, DARK_OWNER, LIGHT, cmd, mentions, place, post, run, runUntil, view, world } from './helpers.ts';

const VIEWERS = [DARK_OWNER, DARK_MATE, LIGHT, null] as const;

describe('hidden actors are absent, not merely undrawn', () => {
  it('a Light hero in cover reaches no Dark seat and no spectator, in any field', () => {
    const w = world();
    post(w.scout, 0, 2, 0, 1); // on the road, looking south
    place(w.hero, -7.3125, 15.6875); // behind the thicket
    run(w.sim, 90);
    for (const slot of [DARK_OWNER, DARK_MATE, null]) {
      const snap = view(w.sim, slot);
      expect(snap.actors.some((a) => a.id === w.hero.id), `viewer ${slot}`).toBe(false);
      expect(mentions(snap, w.hero.x), `viewer ${slot} x`).toBe(false);
      expect(mentions(snap, w.hero.z), `viewer ${slot} z`).toBe(false);
      expect(snap.evidence).toEqual([]);
    }
    // The hero still sees itself.
    expect(view(w.sim, LIGHT).actors.map((a) => a.id)).toContain(w.hero.id);
  });

  it('a Scout behind the house reaches no Light seat and no spectator', () => {
    const w = world();
    post(w.scout, -9.4375, -11.5625, 1, 0); // north of the house
    place(w.hero, -9, 4); // south of the house
    run(w.sim, 1);
    for (const slot of [LIGHT, null]) {
      const snap = view(w.sim, slot);
      expect(snap.actors.some((a) => a.kind === 'monster')).toBe(false);
      expect(mentions(snap, w.scout.x)).toBe(false);
      expect(mentions(snap, w.scout.z)).toBe(false);
    }
    // Dark heroes are not sent either: they are out of the hero's sight.
    expect(view(w.sim, LIGHT).actors.every((a) => a.team === 'light')).toBe(true);
    // Its own side always sees it.
    for (const slot of [DARK_OWNER, DARK_MATE]) expect(view(w.sim, slot).actors.some((a) => a.id === w.scout.id)).toBe(true);
  });

  it('stepping out of cover makes hero and Scout appear to each other; stepping back removes them the same tick', () => {
    const w = world();
    post(w.scout, -9.4375, -11.5625, 1, 0);
    w.brain.waitTicks = 9999;
    w.brain.waitTotal = 1e9;
    place(w.hero, -3.5, -11.5); // east of the house, in front of the Scout
    run(w.sim, 1);
    expect(view(w.sim, LIGHT).actors.some((a) => a.id === w.scout.id)).toBe(true);
    place(w.hero, -9, 4);
    run(w.sim, 1);
    expect(view(w.sim, LIGHT).actors.some((a) => a.id === w.scout.id)).toBe(false);
  });
});

describe('D-012: shared alerts, private live vision', () => {
  function chase() {
    const w = world(11);
    post(w.scout, -9, 12, 0, -1);
    place(w.hero, -4.5, -1);
    expect(runUntil(w.sim, () => w.brain.mode === 'chase', 400)).toBeGreaterThan(0);
    return w;
  }

  it('before confirmation nobody on the Dark side is shown the hero: a glimpse is a place, not a person', () => {
    const w = world(11);
    post(w.scout, -9, 12, 0, -1);
    place(w.hero, -4.5, -1);
    expect(runUntil(w.sim, () => w.brain.mode === 'investigate', 400)).toBeGreaterThan(0);
    const owner = view(w.sim, DARK_OWNER);
    expect(owner.actors.some((a) => a.id === w.hero.id)).toBe(false);
    expect(owner.evidence).toHaveLength(1);
    expect(owner.evidence[0]).toMatchObject({ kind: 'glimpse' });
    expect(owner.evidence[0]!.subject).toBeUndefined();
    expect(view(w.sim, DARK_MATE).evidence).toEqual([]);
  });

  it('the owner gets the Scout\'s live vision; a teammate gets only the frozen alert', () => {
    const w = chase();
    const alert = w.sim.evidence.find((e) => e.kind === 'sighting')!;
    // The hero now runs east across the open clearing, in full view of the Scout.
    step(w.sim, [cmd(LIGHT, { type: 'moveDir', dx: 1, dz: 0.2 })]);
    let liveTicks = 0;
    run(w.sim, 120, () => {
      const seenByScout = w.brain.targets[0]?.visible === true;
      const owner = view(w.sim, DARK_OWNER);
      const mate = view(w.sim, DARK_MATE);
      const publicView = view(w.sim, null);
      const ownersCopy = owner.actors.find((a) => a.id === w.hero.id);
      if (seenByScout) {
        liveTicks++;
        expect(ownersCopy).toMatchObject({ x: w.hero.x, z: w.hero.z }); // live
      } else {
        expect(ownersCopy).toBeUndefined();
      }
      // The teammate never gets the hero, nor its current coordinates anywhere.
      expect(mate.actors.some((a) => a.id === w.hero.id)).toBe(false);
      expect(mentions(mate, w.hero.x)).toBe(false);
      expect(mentions(mate, w.hero.z)).toBe(false);
      // What the teammate has is the alert, exactly as filed.
      expect(mate.evidence).toEqual([{ id: alert.id, kind: 'sighting', x: alert.x, z: alert.z, tick: alert.tick, source: w.scout.id, subject: w.hero.id }]);
      // The teammate sees the allied Scout, but not where it is heading or why.
      const scoutCopy = mate.actors.find((a) => a.id === w.scout.id)!;
      expect(scoutCopy.order).toBeUndefined();
      expect(scoutCopy.mode).toBeUndefined();
      expect(scoutCopy.owner).toBe(DARK_OWNER);
      // A spectator may see a hero the opposing team can see, and no evidence.
      expect(publicView.evidence).toEqual([]);
      expect(publicView.actors.some((a) => a.id === w.hero.id)).toBe(seenByScout);
    });
    expect(liveTicks).toBeGreaterThan(60);
    expect(w.sim.evidence.filter((e) => e.kind === 'sighting')).toHaveLength(1); // one alert, not a stream
  });

  it('when sight breaks, the owner is left with a frozen last-seen point and no stale copy of the hero', () => {
    const w = chase();
    // Keep the Dark heroes' own eyes out of it: this is about the Scout's vision.
    for (const slot of [DARK_OWNER, DARK_MATE]) place(w.sim.actors.find((a) => a.slot === slot)!, 27, -27 + slot * 2);
    step(w.sim, [cmd(LIGHT, { type: 'moveTo', x: -10, z: -9.5 })]);
    expect(runUntil(w.sim, () => w.brain.lostTicks > 0, 300)).toBeGreaterThan(0);
    const seen = w.sim.evidence.find((e) => e.kind === 'lastSeen')!;
    let unseenTicks = 0;
    run(w.sim, 240, () => {
      const owner = view(w.sim, DARK_OWNER);
      const visible = w.brain.targets.some((t) => t.actorId === w.hero.id && t.visible && t.confirmed);
      // The owner's copy of the hero exists exactly while the Scout sees a hero it has confirmed.
      expect(owner.actors.some((a) => a.id === w.hero.id)).toBe(visible);
      if (!visible && w.hero.moving) {
        unseenTicks++;
        expect(mentions(owner, w.hero.x)).toBe(false);
        expect(mentions(owner, w.hero.z)).toBe(false);
      }
      expect(owner.evidence.find((e) => e.id === seen.id)).toEqual({ id: seen.id, kind: 'lastSeen', x: seen.x, z: seen.z, tick: seen.tick, source: w.scout.id, subject: w.hero.id });
      // The teammate is not told the last-seen point (only confirmed sightings are shared).
      expect(view(w.sim, DARK_MATE).evidence.some((e) => e.kind === 'lastSeen')).toBe(false);
    });
    expect(unseenTicks).toBeGreaterThan(10);
  });

  it('evidence expires and is then sent to nobody', () => {
    const w = chase();
    place(w.hero, 0, 27);
    run(w.sim, TUNING.perception.evidenceLifetimeTicks + 1300);
    expect(w.sim.evidence).toEqual([]);
    expect(view(w.sim, DARK_OWNER).evidence).toEqual([]);
  });
});

describe('D-014: the local attention indicator and sounds reveal nothing they should not', () => {
  it('the indicator is one number and a flag: no position, no monster identity', () => {
    const w = world(11);
    post(w.scout, -9, 12, 0, -1);
    place(w.hero, -4.5, -1);
    const seenLevels = new Set<number>();
    runUntil(w.sim, () => w.brain.mode === 'chase', 400, () => {
      const you = view(w.sim, LIGHT).you!;
      expect(Object.keys(you).sort()).toEqual(['actorId', 'attention', 'carried', 'slot', 'spotted', 'team', 'whistleCooldown']);
      seenLevels.add(you.attention);
    });
    expect(seenLevels.size).toBeGreaterThan(20); // it rises gradually
    expect(view(w.sim, LIGHT).you).toMatchObject({ attention: 1, spotted: true });
    // Dark players have no such meter on the hero: they get evidence instead.
    expect(view(w.sim, DARK_OWNER).you!.attention).toBe(0);
  });

  it('a growl is heard without a position; the emitter is named only if the listener can see it', () => {
    const w = world(5);
    post(w.scout, 0.3125, 5.4375, 0, -1);
    place(w.hero, 5.5, 15); // behind the ruined wall: cannot see the Scout
    step(w.sim, [cmd(LIGHT, { type: 'whistle' })]);
    const hidden = view(w.sim, LIGHT);
    expect(hidden.actors.some((a) => a.kind === 'monster')).toBe(false);
    const growl = hidden.sounds.find((s) => s.kind === 'growl')!;
    expect(growl).toBeDefined();
    expect(Object.keys(growl).sort()).toEqual(['kind', 'volume']);
    expect(mentions(hidden, w.scout.x) || mentions(hidden, w.scout.z)).toBe(false);
    expect([0.2, 0.4, 0.6, 0.8, 1]).toContain(growl.volume);

    const v = world(5);
    post(v.scout, 0, 5, 0, -1);
    place(v.hero, 0, 12); // in the open behind it
    step(v.sim, [cmd(LIGHT, { type: 'whistle' })]);
    const open = view(v.sim, LIGHT);
    expect(open.sounds.find((s) => s.kind === 'growl')).toMatchObject({ actorId: v.scout.id });
    // Sounds last one tick.
    run(v.sim, 1);
    expect(view(v.sim, LIGHT).sounds).toEqual([]);
  });

  it('cache state is known to Light and must be seen by Dark', () => {
    const w = world();
    const site = MAP.sites[0]!;
    place(w.hero, site.x, site.z + 1);
    post(w.scout, 0, 0, 0, -1);
    expect(runUntil(w.sim, () => w.hero.carried === 1, TUNING.sites.gatherTicks + 5)).toBeGreaterThan(0);
    expect(view(w.sim, LIGHT).sites.find((s) => s.id === site.id)).toMatchObject({ available: false });
    expect(view(w.sim, LIGHT).you!.carried).toBe(1);
    expect(view(w.sim, DARK_OWNER).sites.map((s) => s.available)).toEqual([null, null]);
    expect(view(w.sim, null).sites.map((s) => s.available)).toEqual([null, null]);
    // Opening it made a noise at the cache, not at the hero.
    const dark = w.sim.actors.find((a) => a.slot === DARK_OWNER)!;
    place(dark, site.x + 6, site.z - 1);
    run(w.sim, 1);
    expect(view(w.sim, DARK_OWNER).sites.find((s) => s.id === site.id)!.available).toBe(false);
  });
});

describe('property: a busy eight-bot match never leaks', () => {
  it('for every seat and every tick, no snapshot mentions the coordinates of an actor it does not list, and every listed enemy is legitimately seen', () => {
    const match = new Match({ seed: 4242, mapId: MAP.id, botSlots: [0, 1, 2, 3, 4, 5, 6, 7] });
    const sessions = Array.from({ length: 8 }, (_, slot) => slot);
    // Read each seat's snapshot exactly as the room would send it.
    const snapshotFor = (slot: number | null): Snapshot => view(match.inspect() as never, slot);
    let enemySightings = 0;
    let hiddenChecks = 0;
    let sharedAlerts = 0;
    for (let tick = 0; tick < 30 * 90; tick++) {
      match.advance();
      if (tick % 3) continue;
      const state = match.inspect();
      for (const slot of [...sessions, null]) {
        const snap = snapshotFor(slot);
        const text = JSON.stringify(snap);
        const listed = new Set(snap.actors.map((a) => a.id));
        const team = slot === null ? null : slot < 4 ? 'dark' : 'light';
        const myHero = slot === null ? undefined : state.actors.find((a) => a.slot === slot);
        for (const actor of state.actors) {
          if (!listed.has(actor.id)) {
            hiddenChecks++;
            // Skip coordinates that are round or shared by coincidence with something visible.
            // A frozen evidence point can equal the position of a hero who has not moved since.
            if (Number.isInteger(actor.x * 4) || snap.actors.some((a) => a.x === actor.x) || snap.evidence.some((e) => e.x === actor.x)) continue;
            expect(text.includes(JSON.stringify(actor.x)), `slot ${slot} tick ${state.tick}: hidden actor ${actor.id} x leaked`).toBe(false);
            continue;
          }
          if (team === null || actor.team === team) continue;
          enemySightings++;
          // Independent justification for showing an enemy to this seat.
          const d = Math.hypot(myHero!.x - actor.x, myHero!.z - actor.z);
          const ownEyes = d <= TUNING.hero.viewRadius && exposure(MAP, myHero!.x, myHero!.z, actor.x, actor.z, actor.radius) > 0;
          const myMonster = state.actors.some((m) => m.brain?.ownerSlot === slot && m.brain.targets.some((t) => t.actorId === actor.id && t.visible && t.confirmed));
          const watchingMe = actor.brain?.targets.some((t) => t.actorId === myHero!.id && t.visible) ?? false;
          expect(ownEyes || myMonster || watchingMe, `slot ${slot} tick ${state.tick}: actor ${actor.id} shown without sight`).toBe(true);
        }
        if (team !== 'dark') expect(snap.evidence).toEqual([]);
        else {
          for (const e of snap.evidence) {
            const record = state.evidence.find((r) => r.id === e.id)!;
            expect(record.shared || record.ownerSlot === slot).toBe(true);
            if (record.shared && record.ownerSlot !== slot) sharedAlerts++;
          }
        }
      }
    }
    // The run must actually have exercised all three cases.
    expect(enemySightings).toBeGreaterThan(200);
    expect(hiddenChecks).toBeGreaterThan(5000);
    expect(sharedAlerts).toBeGreaterThan(0);
  });
});
