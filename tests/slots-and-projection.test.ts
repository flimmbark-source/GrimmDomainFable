import { describe, expect, it } from 'vitest';
import { SLOT_COUNT, SLOTS_PER_TEAM, parseCommand, teamOfSlot, type Snapshot } from '../src/shared/protocol.ts';
import { FOREST_CROSSING } from '../src/shared/sim/map.ts';
import { projectSnapshot, viewerForSlot } from '../src/shared/sim/projection.ts';
import { createSim, findFreeSlot, occupySlot, step, vacateSlot, type SimState } from '../src/shared/sim/simulation.ts';
import { Match } from '../src/server/match.ts';

const MAP_ID = FOREST_CROSSING.id;

describe('slots (D-001: 4 Dark vs 4 Light)', () => {
  it('has exactly eight slots: four Dark, four Light', () => {
    const sim = createSim({ seed: 1, mapId: MAP_ID });
    expect(sim.slots).toHaveLength(8);
    expect(SLOT_COUNT).toBe(8);
    expect(sim.slots.filter((s) => s.team === 'dark')).toHaveLength(SLOTS_PER_TEAM);
    expect(sim.slots.filter((s) => s.team === 'light')).toHaveLength(SLOTS_PER_TEAM);
    expect(sim.slots.every((s) => s.occupant === 'empty' && s.team === teamOfSlot(s.id))).toBe(true);
  });

  it('any slot can be empty, human or bot, and each occupied slot gets one hero', () => {
    const sim = createSim({ seed: 1, mapId: MAP_ID });
    for (let id = 0; id < SLOT_COUNT; id++) expect(occupySlot(sim, id, id % 2 ? 'bot' : 'human')).toBe(true);
    expect(sim.slots.map((s) => s.occupant)).toEqual(['human', 'bot', 'human', 'bot', 'human', 'bot', 'human', 'bot']);
    const heroes = sim.actors.filter((a) => a.kind === 'hero');
    expect(heroes).toHaveLength(8);
    expect(heroes.filter((h) => h.team === 'dark')).toHaveLength(4);
    expect(heroes.filter((h) => h.team === 'light')).toHaveLength(4);
  });

  it('refuses a ninth player and double occupation', () => {
    const sim = createSim({ seed: 1, mapId: MAP_ID });
    for (let id = 0; id < SLOT_COUNT; id++) occupySlot(sim, id, 'human');
    expect(findFreeSlot(sim)).toBeNull();
    expect(occupySlot(sim, 3, 'bot')).toBe(false);
    expect(occupySlot(sim, 8, 'human')).toBe(false);
    vacateSlot(sim, 6);
    expect(findFreeSlot(sim, 'dark')).toBe(6); // only seat left, even though it is Light
    expect(sim.actors.filter((a) => a.kind === 'hero')).toHaveLength(7);
  });

  it('prefers the requested team while it has room', () => {
    const sim = createSim({ seed: 1, mapId: MAP_ID });
    expect(findFreeSlot(sim, 'light')).toBe(4);
    expect(findFreeSlot(sim, 'dark')).toBe(0);
  });
});

// ---------------------------------------------------------------------------

/** Every key that may ever appear in something sent to a client. */
const ALLOWED_KEYS = new Set([
  'tick', 'you', 'slots', 'actors', 'sites', 'evidence', 'sounds',
  'slot', 'team', 'actorId', 'attention', 'spotted', 'carried', 'whistleCooldown',
  'id', 'occupant',
  'kind', 'x', 'z', 'dirX', 'dirZ', 'moving', 'radius', 'order',
  'sneaking', 'monster', 'mood', 'owner', 'mode',
  'available', 'progress', 'source', 'subject', 'volume',
]);

function collectKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
  return out;
}

/** A busy world: two Light heroes and one Dark hero with pending orders. */
function busySim(): SimState {
  const sim = createSim({ seed: 987654321, mapId: MAP_ID });
  occupySlot(sim, 0, 'human');
  occupySlot(sim, 4, 'human');
  occupySlot(sim, 5, 'bot');
  step(sim, [
    { slot: 0, command: { type: 'moveTo', x: 11.25, z: -17.5 } },
    { slot: 4, command: { type: 'moveTo', x: -13.75, z: 16.5 } },
    { slot: 5, command: { type: 'moveTo', x: 19.5, z: 21.25 } },
  ]);
  for (let i = 0; i < 40; i++) step(sim, []);
  return sim;
}

describe('view projection (allow-list and orders)', () => {
  const sim = busySim();
  const views: Record<string, Snapshot> = {
    public: projectSnapshot(sim, null),
    dark0: projectSnapshot(sim, viewerForSlot(sim, 0)),
    light4: projectSnapshot(sim, viewerForSlot(sim, 4)),
    light5: projectSnapshot(sim, viewerForSlot(sim, 5)),
  };

  it('only allow-listed fields are ever emitted', () => {
    for (const [name, view] of Object.entries(views)) {
      const unexpected = [...collectKeys(view)].filter((k) => !ALLOWED_KEYS.has(k));
      expect(unexpected, name).toEqual([]);
    }
  });

  it('never emits the seed, PRNG state or patrol brain', () => {
    for (const [name, view] of Object.entries(views)) {
      const json = JSON.stringify(view);
      expect(json, name).not.toContain(String(sim.seed));
      expect(json, name).not.toContain(String(sim.rng));
      for (const key of ['rng', 'seed', 'intent', 'brain', 'path', 'targets', 'lastSeen', 'search', 'assignment', 'waitTicks', 'waypoint', 'stuckTicks', 'nextActorId', 'stealth', 'noises', 'events']) {
        expect(json, `${name}:${key}`).not.toContain(`"${key}"`);
      }
    }
  });

  it('the public view contains no orders at all', () => {
    expect(views.public!.you).toBeNull();
    expect(views.public!.actors.some((a) => a.order)).toBe(false);
    expect(JSON.stringify(views.public)).not.toContain('11.25');
    expect(JSON.stringify(views.public)).not.toContain('-13.75');
  });

  it('a player sees their own order but not an opponent\'s or a teammate\'s', () => {
    const light = views.light4!;
    const mine = light.actors.find((a) => a.slot === 4)!;
    expect(mine.order).toEqual({ x: -13.75, z: 16.5 });
    expect(light.actors.filter((a) => a.order).map((a) => a.slot)).toEqual([4]);
    const json = JSON.stringify(light);
    expect(json).not.toContain('11.25'); // Dark hero's destination
    expect(json).not.toContain('19.5'); // teammate's destination (sharing rules undecided)
  });

  it('the monster\'s destination goes to its owner only (D-012)', () => {
    const scout = sim.actors.find((a) => a.kind === 'monster')!;
    expect(scout.brain!.ownerSlot).toBe(0);
    // Give it somewhere to go, then look at every viewer's copy of it.
    const walking = createSim({ seed: 5, mapId: MAP_ID });
    for (const slot of [0, 1, 4]) occupySlot(walking, slot, 'human');
    step(walking, [{ slot: 0, command: { type: 'monsterOrder', actorId: scout.id, order: 'guard', x: 12.25, z: 6.75 } }]);
    step(walking, []);
    const copy = (slot: number | null) => projectSnapshot(walking, viewerForSlot(walking, slot)).actors.find((a) => a.kind === 'monster');
    expect(copy(0)!.order).toEqual({ x: 12.25, z: 6.75 });
    expect(copy(0)!.mode).toBe('return');
    // A Dark teammate sees the allied monster, but not where it is going.
    expect(copy(1)).toBeDefined();
    expect(copy(1)!.order).toBeUndefined();
    expect(copy(1)!.mode).toBeUndefined();
    for (const slot of [4, null]) {
      expect(JSON.stringify(projectSnapshot(walking, viewerForSlot(walking, slot)))).not.toContain('12.25');
    }
  });

  it('snapshots are detached copies: mutating one cannot touch the simulation', () => {
    const view = projectSnapshot(sim, viewerForSlot(sim, 4));
    view.actors[0]!.x = 9999;
    view.slots[0]!.occupant = 'human';
    expect(sim.actors[0]!.x).not.toBe(9999);
    expect(projectSnapshot(sim, null).actors[0]!.x).not.toBe(9999);
  });
});

describe('command validation', () => {
  it('rejects malformed payloads', () => {
    const bad: unknown[] = [
      null, undefined, 5, 'moveTo', [], {},
      { type: 'teleport', x: 0, z: 0 },
      { type: 'moveTo', x: '1', z: 2 },
      { type: 'moveTo', x: NaN, z: 0 },
      { type: 'moveTo', x: Infinity, z: 0 },
      { type: 'moveTo', x: 1e9, z: 0 },
      { type: 'moveDir', dx: 1 },
      { type: 'moveDir', dx: NaN, dz: 1 },
    ];
    for (const payload of bad) expect(parseCommand(payload), JSON.stringify(payload)).toBeNull();
  });

  it('normalises directions and drops unknown fields', () => {
    expect(parseCommand({ type: 'moveDir', dx: 30, dz: 40, speed: 99, slot: 0 })).toEqual({ type: 'moveDir', dx: 0.6, dz: 0.8 });
    expect(parseCommand({ type: 'moveDir', dx: 0, dz: 0 })).toEqual({ type: 'moveDir', dx: 0, dz: 0 });
    expect(parseCommand({ type: 'stop', slot: 3 })).toEqual({ type: 'stop' });
  });
});

describe('match host authority', () => {
  it('a client can only command its own seat, whatever its payload claims', () => {
    const match = new Match({ seed: 3, mapId: MAP_ID });
    expect(match.join('alice', 'light')).toBe(4);
    expect(match.join('bob', 'dark')).toBe(0);
    const bobBefore = match.snapshotFor('bob').actors.find((a) => a.slot === 0)!;
    // Alice tries to drive Bob's slot.
    expect(match.submit('alice', { type: 'moveDir', dx: 1, dz: 0, slot: 0 })).toBe(true);
    for (let i = 0; i < 30; i++) match.advance();
    const bob = match.snapshotFor('bob').actors.find((a) => a.slot === 0)!;
    const alice = match.snapshotFor('alice').actors.find((a) => a.slot === 4)!;
    expect({ x: bob.x, z: bob.z }).toEqual({ x: bobBefore.x, z: bobBefore.z });
    expect(alice.x).toBeGreaterThan(-3 + 5);
  });

  it('spectators and unknown sessions cannot act; invalid payloads are rejected', () => {
    const match = new Match({ seed: 3, mapId: MAP_ID, botSlots: [0, 1, 2, 3, 4, 5, 6] });
    expect(match.join('alice')).toBe(7);
    expect(match.join('ninth')).toBeNull();
    expect(match.submit('ninth', { type: 'stop' })).toBe(false);
    expect(match.submit('nobody', { type: 'stop' })).toBe(false);
    expect(match.submit('alice', { type: 'fly' })).toBe(false);
    expect(match.snapshotFor('ninth').you).toBeNull();
  });

  it('limits commands per connection per tick', () => {
    const match = new Match({ seed: 3, mapId: MAP_ID });
    match.join('alice');
    const accepted = Array.from({ length: 10 }, () => match.submit('alice', { type: 'stop' })).filter(Boolean);
    expect(accepted).toHaveLength(4);
    match.advance();
    expect(match.submit('alice', { type: 'stop' })).toBe(true);
  });

  it('bots act through the same command path and move their heroes', () => {
    const match = new Match({ seed: 11, mapId: MAP_ID, botSlots: [1, 5] });
    // Server-side inspection: the public view no longer shows hidden heroes.
    const heroes = () => match.inspect().actors.filter((a) => a.kind === 'hero').map((a) => ({ x: a.x, z: a.z }));
    const start = heroes();
    for (let i = 0; i < 300; i++) match.advance();
    const view = match.snapshotFor(null);
    expect(view.slots.filter((s) => s.occupant === 'bot').map((s) => s.id)).toEqual([1, 5]);
    const end = heroes();
    expect(end).toHaveLength(2);
    end.forEach((p, i) => expect(Math.hypot(p.x - start[i]!.x, p.z - start[i]!.z)).toBeGreaterThan(1));
  });

  it('leaving frees the seat and removes the hero', () => {
    const match = new Match({ seed: 3, mapId: MAP_ID });
    match.join('alice', 'light');
    match.leave('alice');
    const view = match.snapshotFor(null);
    expect(view.slots.every((s) => s.occupant === 'empty')).toBe(true);
    expect(match.inspect().actors.filter((a) => a.kind === 'hero')).toHaveLength(0);
    expect(match.join('carol', 'light')).toBe(4);
  });
});
